import type {
  CloudStatus,
  CommandDto,
  DeviceLogDto,
  PlaybackSessionDto,
} from '@vrcc/shared-types';
import type { GatewayConfig } from '../config.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type {
  CommandRecord,
  DeploymentRecord,
  DeviceLogRecord,
  DeviceRecord,
  PlaybackSessionRecord,
  VideoRecord,
} from '../database/types.js';
import { nowIso } from '../utils/time.js';
import type { AdminHub } from '../websocket/hub.js';
import { createCloudAdapter, type CloudAdapter } from './cloudAdapter.js';

const TABLE_BY_ENTITY: Record<string, { table: string; conflict?: string; deleteIdField?: string }> = {
  device: { table: 'devices', conflict: 'id' },
  video: { table: 'videos', conflict: 'id' },
  playback_session: { table: 'playback_sessions', conflict: 'id' },
  command: { table: 'device_commands', conflict: 'id' },
  device_log: { table: 'device_logs', conflict: 'id' },
  device_video: { table: 'device_videos', conflict: 'device_id,video_id' },
};

const LAST_SYNC_KEY = 'cloud.lastSyncAt';
const LAST_ERROR_KEY = 'cloud.lastError';

/**
 * Durable outbox for persistent records. Live playback commands never wait for
 * Supabase; this worker only synchronizes audit/metadata after the fact.
 */
export class CloudSyncService {
  private readonly adapter: CloudAdapter | null;
  private online = false;
  private lastSyncAt: string | null;
  private lastError: string | null;
  private timer: NodeJS.Timeout | null = null;
  private syncing = false;
  private lastBroadcast = '';

  constructor(
    private readonly config: GatewayConfig,
    private readonly ops: OpsRepository,
    private readonly hub: AdminHub,
    adapter?: CloudAdapter | null,
  ) {
    this.adapter = adapter === undefined ? createCloudAdapter(config.supabase) : adapter;
    this.lastSyncAt = this.ops.getInternalSetting(LAST_SYNC_KEY);
    this.lastError =
      this.ops.getInternalSetting(LAST_ERROR_KEY) ??
      (this.config.supabase.configured && !this.config.supabase.serviceRoleKey
        ? 'SUPABASE_SERVICE_ROLE_KEY is not configured; cloud synchronization is disabled'
        : null);
  }

  get enabled(): boolean {
    return Boolean(this.config.supabase.configured && this.config.supabase.syncEnabled);
  }

  get adapterAvailable(): boolean {
    return this.adapter !== null;
  }

  status(): CloudStatus {
    return {
      configured: this.config.supabase.configured,
      online: this.online,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      pendingChanges: this.ops.pendingOutboxCount(),
      storageBackend: 'local',
    };
  }

  broadcastStatus(force = false): void {
    const status = this.status();
    const serialized = JSON.stringify(status);
    if (!force && serialized === this.lastBroadcast) return;
    this.lastBroadcast = serialized;
    this.hub.broadcast({ kind: 'cloud.status', cloud: status });
  }

  start(): void {
    if (!this.enabled || !this.adapter) {
      this.broadcastStatus(true);
      return;
    }
    void this.syncNow();
    this.timer = setInterval(() => {
      void this.syncNow();
    }, this.config.supabase.syncIntervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async checkNow(): Promise<boolean> {
    if (!this.adapter) {
      this.online = false;
      return false;
    }
    this.online = await this.adapter.checkHealth();
    this.broadcastStatus();
    return this.online;
  }

  async syncNow(): Promise<void> {
    if (!this.enabled || !this.adapter || this.syncing) return;
    this.syncing = true;
    try {
      const healthy = await this.adapter.checkHealth();
      this.online = healthy;
      if (!healthy) {
        this.setError('Cloud unreachable');
        this.broadcastStatus();
        return;
      }
      const pending = this.ops.listOutbox(100);
      for (const record of pending) {
        const mapping = TABLE_BY_ENTITY[record.entity];
        if (!mapping) {
          this.ops.markOutboxSynced(record.id);
          continue;
        }
        try {
          if (record.operation === 'delete') {
            const id = String(record.payload.id ?? '');
            if (id) await this.adapter.remove(mapping.table, id);
          } else {
            await this.adapter.upsert(mapping.table, record.payload, mapping.conflict);
          }
          this.ops.markOutboxSynced(record.id);
        } catch (error) {
          this.ops.markOutboxFailed(
            record.id,
            error instanceof Error ? error.message : String(error),
          );
          this.lastError = 'Some changes could not be synchronized';
        }
      }
      this.lastSyncAt = nowIso();
      this.lastError = null;
      this.ops.setInternalSetting(LAST_SYNC_KEY, this.lastSyncAt);
      this.ops.setInternalSetting(LAST_ERROR_KEY, '');
      this.broadcastStatus(true);
    } finally {
      this.syncing = false;
    }
  }

  private setError(message: string): void {
    this.lastError = message;
    this.ops.setInternalSetting(LAST_ERROR_KEY, message);
  }

  /* -------------------------- Queue helpers ------------------------------- */

  private enqueue(entity: string, operation: 'upsert' | 'delete', payload: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.ops.enqueue(entity, operation, payload);
    this.broadcastStatus();
  }

  queueDevice(device: DeviceRecord): void {
    this.enqueue('device', 'upsert', {
      id: device.id,
      device_uuid: device.deviceUuid,
      name: device.name,
      model: device.model,
      status: device.status,
      last_ip_address: device.ipAddress,
      app_version: device.appVersion,
      battery_level: device.batteryLevel,
      last_seen_at: device.lastSeenAt,
      paired_at: device.pairedAt,
      created_at: device.createdAt,
      updated_at: device.updatedAt,
    });
  }

  queueDeviceDelete(deviceId: string): void {
    this.enqueue('device', 'delete', { id: deviceId });
  }

  queueVideo(video: VideoRecord): void {
    this.enqueue('video', 'upsert', {
      id: video.id,
      name: video.name,
      original_filename: video.originalFilename,
      storage_path: video.storagePath,
      storage_backend: video.storageBackend,
      size_bytes: video.sizeBytes,
      duration_seconds: video.durationSeconds,
      width: video.width,
      height: video.height,
      frame_rate: video.frameRate,
      video_codec: video.videoCodec,
      audio_codec: video.audioCodec,
      projection_type: video.projectionType,
      stereo_layout: video.stereoLayout,
      checksum: video.checksum,
      created_at: video.createdAt,
      updated_at: video.updatedAt,
    });
  }

  queueVideoDelete(videoId: string): void {
    this.enqueue('video', 'delete', { id: videoId });
  }

  queueSession(session: PlaybackSessionRecord): void {
    this.enqueue('playback_session', 'upsert', {
      id: session.id,
      device_id: session.deviceId,
      video_id: session.videoId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      last_position_seconds: session.lastPositionSeconds,
      final_status: session.finalStatus,
      created_at: session.createdAt,
      updated_at: session.updatedAt,
    });
  }

  queueCommand(command: CommandRecord): void {
    this.enqueue('command', 'upsert', {
      id: command.id,
      device_id: command.deviceId,
      command_type: command.commandType,
      payload: command.payload,
      requested_by: command.requestedBy,
      status: command.status,
      requested_at: command.requestedAt,
      acknowledged_at: command.acknowledgedAt,
      error_message: command.errorMessage,
    });
  }

  queueLog(log: DeviceLogRecord): void {
    this.enqueue('device_log', 'upsert', {
      id: log.id,
      device_id: log.deviceId,
      event_type: log.eventType,
      payload: log.payload,
      created_at: log.createdAt,
    });
  }

  queueDeployment(deployment: DeploymentRecord): void {
    if (deployment.status !== 'ready') return;
    this.enqueue('device_video', 'upsert', {
      id: deployment.id,
      device_id: deployment.deviceId,
      video_id: deployment.videoId,
      download_status: deployment.status,
      download_progress: deployment.progress,
      checksum_verified: deployment.checksumVerified,
      downloaded_at: deployment.completedAt,
      updated_at: deployment.updatedAt,
    });
  }

  queueSessionDto(session: PlaybackSessionDto): void {
    this.enqueue('playback_session', 'upsert', {
      id: session.id,
      device_id: session.deviceId,
      video_id: session.videoId,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      last_position_seconds: session.lastPositionSeconds,
      final_status: session.finalStatus,
    });
  }

  queueCommandDto(command: CommandDto): void {
    this.enqueue('command', 'upsert', {
      id: command.id,
      device_id: command.deviceId,
      command_type: command.type,
      payload: command.payload,
      requested_by: command.requestedBy,
      status: command.status,
      requested_at: command.requestedAt,
      acknowledged_at: command.acknowledgedAt,
      error_message: command.errorMessage,
    });
  }

  queueLogDto(log: DeviceLogDto): void {
    this.enqueue('device_log', 'upsert', {
      id: log.id,
      device_id: log.deviceId,
      event_type: log.eventType,
      payload: log.payload,
      created_at: log.createdAt,
    });
  }
}
