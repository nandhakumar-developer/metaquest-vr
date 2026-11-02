import {
  EMPTY_PLAYBACK,
  type DeviceCapabilities,
  type DeviceSnapshot,
  type DeviceStorageInfo,
  type PlaybackSnapshot,
  type PlaybackState,
} from '@vrcc/shared-types';
import { z } from 'zod';
import {
  heartbeatPayloadSchema,
  playbackEventPayloadSchema,
  deviceRegisterPayloadSchema,
} from '@vrcc/protocol';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { VideoRepository } from '../database/videoRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceRecord } from '../database/types.js';
import { nowIso } from '../utils/time.js';
import { notFound } from '../utils/errors.js';
import type { DeviceRegistry } from './registry.js';
import type { AdminHub } from '../websocket/hub.js';
import type { CloudSyncService } from '../services/cloudSync.js';

type HeartbeatPayload = z.infer<typeof heartbeatPayloadSchema>;
type PlaybackEventPayload = z.infer<typeof playbackEventPayloadSchema>;

const SESSION_CLOSE_STATES: Record<string, 'completed' | 'stopped' | 'error'> = {
  ended: 'completed',
  idle: 'stopped',
  error: 'error',
};

export class DeviceStateService {
  private readonly lastBroadcast = new Map<string, number>();
  private readonly lastPlaybackState = new Map<string, PlaybackState>();
  private readonly playbackListeners = new Set<
    (deviceId: string, playback: PlaybackSnapshot, device: DeviceRecord) => void
  >();
  private readonly disconnectListeners = new Set<(deviceId: string) => void>();

  constructor(
    private readonly devices: DeviceRepository,
    private readonly videos: VideoRepository,
    private readonly ops: OpsRepository,
    private readonly registry: DeviceRegistry,
    private readonly hub: AdminHub,
    private readonly cloud: CloudSyncService,
  ) {}

  toDto(device: DeviceRecord): DeviceSnapshot {
    const connection = this.registry.get(device.id);
    return {
      id: device.id,
      deviceUuid: device.deviceUuid,
      name: device.name,
      model: device.model,
      status: device.status,
      online: device.status === 'online' && Boolean(connection),
      ipAddress: device.ipAddress,
      appVersion: device.appVersion,
      batteryLevel: device.batteryLevel,
      charging: device.charging,
      lastSeenAt: device.lastSeenAt,
      pairedAt: device.pairedAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      playback: device.playback,
      capabilities: device.capabilities,
      storage: device.storage,
      previewActive: connection?.previewActive ?? false,
      lastConnectionError: device.lastConnectionError,
      videoCount: device.videoCount,
    };
  }

  listDevices(): DeviceSnapshot[] {
    return this.devices.listDevices().map((device) => this.toDto(device));
  }

  getDevice(id: string): DeviceRecord {
    const device = this.devices.getDevice(id);
    if (!device) throw notFound('Device not found');
    return device;
  }

  getDeviceDto(id: string): DeviceSnapshot {
    return this.toDto(this.getDevice(id));
  }

  getDeviceByUuid(uuid: string): DeviceRecord | null {
    return this.devices.getDeviceByUuid(uuid);
  }

  broadcastDevice(device: DeviceRecord, force = false): void {
    const now = Date.now();
    const last = this.lastBroadcast.get(device.id) ?? 0;
    if (!force && now - last < 400) return;
    this.lastBroadcast.set(device.id, now);
    this.hub.broadcast({ kind: 'device.updated', device: this.toDto(device) });
  }

  onConnected(device: DeviceRecord, ipAddress: string): DeviceRecord {
    const updated = this.devices.markOnline(device.id, ipAddress) ?? device;
    this.logEvent(device.id, 'device.connected', { ipAddress }, true);
    this.cloud.queueDevice(updated);
    this.ops.addAudit({
      actor: 'device',
      action: 'device.connected',
      entityType: 'device',
      entityId: device.id,
      payload: { ipAddress },
    });
    this.broadcastDevice(updated, true);
    return updated;
  }

  onDisconnected(deviceId: string, reason: string): DeviceRecord | null {
    const current = this.devices.getDevice(deviceId);
    if (!current) return null;
    if (current.status !== 'online' && !this.registry.get(deviceId)) return current;
    const updated = this.devices.markOffline(deviceId, reason) ?? current;
    this.ops.closeOpenSessionsForDevice(
      deviceId,
      'interrupted',
      current.playback.positionSeconds,
    );
    this.logEvent(deviceId, 'device.disconnected', { reason }, true);
    this.cloud.queueDevice(updated);
    this.ops.addAudit({
      actor: 'device',
      action: 'device.disconnected',
      entityType: 'device',
      entityId: deviceId,
      payload: { reason },
    });
    this.registry.setPreview(deviceId, false);
    this.hub.broadcast({ kind: 'preview.stopped', deviceId });
    this.broadcastDevice(updated, true);
    for (const listener of this.disconnectListeners) {
      try {
        listener(deviceId);
      } catch {
        // Never let a listener break disconnect handling.
      }
    }
    return updated;
  }

  applyRegister(
    deviceId: string,
    payload: z.infer<typeof deviceRegisterPayloadSchema>,
  ): DeviceRecord {
    const updated = this.devices.updateRuntime(deviceId, {
      appVersion: payload.appVersion,
      model: payload.model,
      capabilities: payload.capabilities as DeviceCapabilities,
      ...(payload.storage ? { storage: payload.storage as DeviceStorageInfo } : {}),
      lastSeenAt: nowIso(),
    });
    const device = updated ?? this.getDevice(deviceId);
    this.broadcastDevice(device, true);
    return device;
  }

  applyHeartbeat(deviceId: string, payload: HeartbeatPayload, forceBroadcast = false): DeviceRecord {    const playback = this.normalizePlayback(payload.playback);
    const wasOnline = this.devices.getDevice(deviceId)?.status === 'online';
    const updated = this.devices.updateRuntime(deviceId, {
      status: 'online',
      appVersion: payload.appVersion,
      model: payload.model,
      batteryLevel: payload.batteryLevel,
      charging: payload.charging,
      lastSeenAt: nowIso(),
      lastConnectionError: null,
      playback,
      storage: payload.storage as DeviceStorageInfo,
      videoCount: Math.min(payload.inventoryCount, 10_000),
      ...(payload.capabilities ? { capabilities: payload.capabilities as DeviceCapabilities } : {}),
    });
    if (!updated) return this.getDevice(deviceId);
    if (!wasOnline) {
      this.logEvent(deviceId, 'device.online', { via: 'heartbeat' }, true);
      this.cloud.queueDevice(updated);
    }
    this.syncSession(updated, playback);
    this.broadcastDevice(updated, forceBroadcast);
    this.notifyPlaybackListeners(updated, playback);
    return updated;
  }

  applyPlaybackEvent(deviceId: string, payload: PlaybackEventPayload): DeviceRecord {
    const current = this.getDevice(deviceId);
    const stateMap: Record<PlaybackEventPayload['event'], PlaybackState> = {
      loading: 'loading',
      buffering: 'buffering',
      ready: 'ready',
      playing: 'playing',
      paused: 'paused',
      stopped: 'idle',
      ended: 'ended',
      error: 'error',
    };
    const playback: PlaybackSnapshot = {
      state: stateMap[payload.event],
      videoId: payload.videoId,
      videoName: payload.videoName ?? current.playback.videoName,
      positionSeconds: Math.max(0, payload.positionSeconds),
      durationSeconds: payload.durationSeconds,
      volume: payload.volume,
      positionConfirmed: true,
      error: payload.error,
      updatedAt: nowIso(),
    };
    const updated = this.devices.updateRuntime(deviceId, {
      playback,
      lastSeenAt: nowIso(),
      ...(payload.durationSeconds && payload.durationSeconds > 0
        ? { status: 'online' as const }
        : {}),
    });
    const result = updated ?? current;
    const previous = this.lastPlaybackState.get(deviceId);
    this.lastPlaybackState.set(deviceId, playback.state);
    const isTransition = previous !== playback.state;
    if (isTransition || playback.state === 'error') {
      this.logEvent(deviceId, `playback.${payload.event}`, {
        videoId: payload.videoId,
        positionSeconds: payload.positionSeconds,
        ...(payload.error ? { error: payload.error } : {}),
      });
    }
    this.syncSession(result, playback);
    this.broadcastDevice(result, isTransition || playback.state === 'error');
    this.notifyPlaybackListeners(result, playback);
    return result;
  }

  /** Subscribe to confirmed device playback reports (used by group scheduling). */
  onPlaybackUpdate(
    listener: (deviceId: string, playback: PlaybackSnapshot, device: DeviceRecord) => void,
  ): () => void {
    this.playbackListeners.add(listener);
    return () => this.playbackListeners.delete(listener);
  }

  onDeviceDisconnected(listener: (deviceId: string) => void): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  private notifyPlaybackListeners(device: DeviceRecord, playback: PlaybackSnapshot): void {
    for (const listener of this.playbackListeners) {
      try {
        listener(device.id, playback, device);
      } catch {
        // A listener failure must never break device state ingestion.
      }
    }
  }

  applyStatusSnapshot(
    deviceId: string,
    payload: HeartbeatPayload | PlaybackEventPayload,
  ): void {
    if ('event' in payload) {
      this.applyPlaybackEvent(deviceId, payload);
    } else {
      this.applyHeartbeat(deviceId, payload, true);
    }
  }

  applyInventory(
    deviceId: string,
    videos: Array<{
      videoId: string;
      name: string;
      filename: string;
      sizeBytes: number;
      checksum: string;
      durationSeconds: number | null;
    }>,
  ): void {
    this.devices.removeAllDeviceVideos(deviceId);
    let accepted = 0;
    let unknown = 0;
    for (const item of videos) {
      if (!this.videos.getVideo(item.videoId)) {
        unknown += 1;
        continue;
      }
      this.devices.upsertDeviceVideo({
        deviceId,
        videoId: item.videoId,
        downloadStatus: 'ready',
        downloadProgress: 1,
        checksumVerified: true,
        localFilename: item.filename,
        sizeBytes: item.sizeBytes,
      });
      accepted += 1;
    }
    this.devices.refreshInventoryCount(deviceId);
    const device = this.devices.getDevice(deviceId);
    if (device) this.broadcastDevice(device, true);
    this.logEvent(deviceId, 'video.inventory_reported', { count: accepted, unknown });
  }

  logEvent(
    deviceId: string,
    eventType: string,
    payload: Record<string, unknown>,
    durable = false,
  ): void {
    const log = this.ops.addDeviceLog(deviceId, eventType, payload);
    this.hub.broadcast({ kind: 'log.created', log });
    if (durable) this.cloud.queueLog(log);
  }

  renameDevice(deviceId: string, name: string, actor: string): DeviceSnapshot {
    const updated = this.devices.renameDevice(deviceId, name);
    if (!updated) throw notFound('Device not found');
    this.logEvent(deviceId, 'device.renamed', { name, actor }, true);
    this.ops.addAudit({
      actor,
      action: 'device.renamed',
      entityType: 'device',
      entityId: deviceId,
      payload: { name },
    });
    this.cloud.queueDevice(updated);
    this.broadcastDevice(updated, true);
    return this.toDto(updated);
  }

  revokeDevice(deviceId: string, actor: string): DeviceSnapshot {
    const updated = this.devices.revokeDevice(deviceId);
    if (!updated) throw notFound('Device not found');
    const connection = this.registry.get(deviceId);
    if (connection) {
      try {
        connection.socket.close(4001, 'Device credentials revoked');
      } catch {
        // Ignore.
      }
      this.registry.detach(deviceId, connection.socket);
    }
    this.logEvent(deviceId, 'device.unpaired', { actor }, true);
    this.ops.addAudit({
      actor,
      action: 'device.unpaired',
      entityType: 'device',
      entityId: deviceId,
      payload: {},
    });
    this.cloud.queueDevice(updated);
    this.broadcastDevice(updated, true);
    return this.toDto(updated);
  }

  deleteDevice(deviceId: string, actor: string): void {
    this.getDevice(deviceId);
    this.devices.deleteDevice(deviceId);
    this.ops.addAudit({
      actor,
      action: 'device.removed',
      entityType: 'device',
      entityId: deviceId,
      payload: {},
    });
    this.cloud.queueDeviceDelete(deviceId);
    this.hub.broadcast({ kind: 'device.removed', deviceId });
  }

  /** Called by the offline monitor after heartbeat timeout. */
  heartbeatTimedOut(deviceId: string): void {
    this.onDisconnected(deviceId, 'Heartbeat timeout');
  }

  private normalizePlayback(input: z.infer<typeof heartbeatPayloadSchema>['playback']): PlaybackSnapshot {
    return {
      state: input.state,
      videoId: input.videoId,
      videoName: input.videoName,
      positionSeconds: Math.max(0, input.positionSeconds),
      durationSeconds: input.durationSeconds,
      volume: input.volume,
      positionConfirmed: input.positionConfirmed ?? true,
      error: input.error,
      updatedAt: input.updatedAt,
    };
  }

  private syncSession(device: DeviceRecord, playback: PlaybackSnapshot): void {
    const open = this.ops.getOpenSession(device.id);
    const state = playback.state;
    // A browser can keep a downloaded video after an administrator removes it
    // from the gateway library. Playback status still carries that video's ID,
    // but playback_sessions.video_id is a foreign key and is set to NULL when
    // the library row is deleted. Keep tracking the local session without
    // trying to insert the now-missing ID again.
    const sessionVideoId =
      playback.videoId && this.videos.getVideo(playback.videoId) ? playback.videoId : null;

    if (state === 'playing') {
      if (!open || open.videoId !== sessionVideoId) {
        if (open) {
          this.ops.closeSession(open.id, 'stopped', playback.positionSeconds);
          this.emitSession(open.id);
        }
        if (playback.videoId) {
          const session = this.ops.openSession({
            deviceId: device.id,
            videoId: sessionVideoId,
            positionSeconds: playback.positionSeconds,
          });
          this.cloud.queueSession(session);
          this.emitSession(session.id);
          this.logEvent(
            device.id,
            'playback.confirmed_playing',
            { videoId: playback.videoId, positionSeconds: playback.positionSeconds },
            true,
          );
        }
      } else {
        this.ops.updateSessionPosition(open.id, playback.positionSeconds);
      }
      return;
    }

    if (!open) return;
    if (open.videoId !== sessionVideoId) {
      this.ops.closeSession(open.id, 'stopped', playback.positionSeconds);
      this.emitSession(open.id);
      return;
    }
    const finalStatus = SESSION_CLOSE_STATES[state];
    if (finalStatus) {
      this.ops.closeSession(open.id, finalStatus, playback.positionSeconds);
      const refreshed = this.ops.getSession(open.id);
      if (refreshed) this.cloud.queueSession(refreshed);
      this.emitSession(open.id);
      return;
    }
    // paused / ready / loading keep the session open.
    this.ops.updateSessionPosition(open.id, playback.positionSeconds);
  }

  private emitSession(sessionId: string): void {
    const dto = this.ops.getSessionDto(sessionId);
    if (dto) this.hub.broadcast({ kind: 'session.updated', session: dto });
  }

  /** Simulated devices in tests use this to seed playback defaults. */
  static emptyPlayback(): PlaybackSnapshot {
    return { ...EMPTY_PLAYBACK, updatedAt: nowIso() };
  }
}
