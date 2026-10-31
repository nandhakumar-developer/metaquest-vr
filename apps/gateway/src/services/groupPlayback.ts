import type { GroupDevicePlaybackState, GroupPlaybackState, PlaybackSnapshot } from '@vrcc/shared-types';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { VideoRepository } from '../database/videoRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { CommandService } from '../commands/service.js';
import type { AdminHub } from '../websocket/hub.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { newId } from '../utils/ids.js';

export interface GroupAssignment {
  deviceId: string;
  videoId: string;
}

interface RunDevice extends GroupDevicePlaybackState {
  expectedVideoId: string;
}

interface Run {
  id: string;
  mode: 'same' | 'mixed';
  status: GroupPlaybackState['status'];
  devices: Map<string, RunDevice>;
  scheduledStartAt: number | null;
  basePositionSeconds: number;
  leadMs: number;
  createdAt: string;
  message: string | null;
  readyTimer: NodeJS.Timeout | null;
  statusTimer: NodeJS.Timeout | null;
  lastCorrection: Map<string, number>;
  broadcastTimer: NodeJS.Timeout | null;
}

const READY_TIMEOUT_MS = 15_000;
const DRIFT_CORRECTION_THRESHOLD_MS = 2_500;
const DRIFT_CORRECTION_COOLDOWN_MS = 10_000;

/**
 * Server-authoritative scheduled group playback.
 *
 * Flow: LOAD_VIDEO to every selected device -> wait for each player's confirmed
 * `ready` playback event -> broadcast a common future start timestamp -> send
 * each device a PLAY command carrying that timestamp. Devices schedule locally
 * using their measured clock offset. Drift is measured from confirmed reports;
 * large drift is corrected with a controlled seek.
 */
export class GroupPlaybackService {
  private run: Run | null = null;
  private readonly unsubscribe: () => void;
  private readonly unsubscribeDisconnect: () => void;

  constructor(
    private readonly devices: DeviceRepository,
    private readonly videos: VideoRepository,
    private readonly registry: DeviceRegistry,
    private readonly state: DeviceStateService,
    private readonly commands: CommandService,
    private readonly hub: AdminHub,
    private readonly ops: OpsRepository,
  ) {
    this.unsubscribe = this.state.onPlaybackUpdate((deviceId, playback) =>
      this.onPlaybackUpdate(deviceId, playback),
    );
    this.unsubscribeDisconnect = this.state.onDeviceDisconnected((deviceId) =>
      this.onDeviceDisconnected(deviceId),
    );
  }

  dispose(): void {
    this.unsubscribe();
    this.unsubscribeDisconnect();
    this.stopTimers();
  }

  getState(): GroupPlaybackState {
    const run = this.run;
    if (!run) {
      return {
        id: null,
        mode: 'same',
        status: 'idle',
        scheduledStartAt: null,
        leadMs: 3000,
        positionSeconds: 0,
        createdAt: null,
        devices: [],
        message: null,
      };
    }
    return {
      id: run.id,
      mode: run.mode,
      status: run.status,
      scheduledStartAt:
        run.scheduledStartAt === null ? null : new Date(run.scheduledStartAt).toISOString(),
      leadMs: run.leadMs,
      positionSeconds: this.expectedPosition(run, Date.now()),
      createdAt: run.createdAt,
      devices: [...run.devices.values()].map(({ expectedVideoId: _expected, ...rest }) => rest),
      message: run.message,
    };
  }

  async start(input: {
    mode: 'same' | 'mixed';
    assignments: GroupAssignment[];
    leadMs?: number;
    positionSeconds?: number;
    actor: string;
  }): Promise<GroupPlaybackState> {
    const unique = new Map<string, GroupAssignment>();
    for (const assignment of input.assignments) {
      unique.set(assignment.deviceId, assignment);
    }
    if (unique.size === 0) throw badRequest('Select at least one headset');
    if (unique.size > 32) throw badRequest('Too many headsets in one group');

    const assignments = [...unique.values()];
    const runDevices = new Map<string, RunDevice>();
    for (const assignment of assignments) {
      const device = this.devices.getDevice(assignment.deviceId);
      if (!device) throw notFound(`Headset not found: ${assignment.deviceId}`);
      if (device.status === 'revoked') throw conflict(`${device.name} is unpaired`);
      if (!this.registry.isConnected(device.id)) {
        throw conflict(`${device.name} is offline. Reconnect it before starting group playback.`);
      }
      const video = this.videos.getVideo(assignment.videoId);
      if (!video) throw notFound(`Video not found: ${assignment.videoId}`);
      runDevices.set(device.id, {
        deviceId: device.id,
        deviceName: device.name,
        videoId: video.id,
        videoName: video.name,
        expectedVideoId: video.id,
        phase: 'loading',
        positionSeconds: 0,
        driftMs: null,
        syncHealth: 'unknown',
        lastSeenAt: new Date().toISOString(),
        error: null,
      });
    }

    this.stopTimers();
    const leadMs = Math.min(10_000, Math.max(1_000, Math.round(input.leadMs ?? 3_000)));
    const run: Run = {
      id: newId(),
      mode: input.mode,
      status: 'preparing',
      devices: runDevices,
      scheduledStartAt: null,
      basePositionSeconds: Math.max(0, input.positionSeconds ?? 0),
      leadMs,
      createdAt: new Date().toISOString(),
      message: 'Loading videos and waiting for each headset to report ready.',
      readyTimer: null,
      statusTimer: null,
      lastCorrection: new Map(),
      broadcastTimer: null,
    };
    this.run = run;
    this.ops.addAudit({
      actor: input.actor,
      action: 'playback.group_started',
      entityType: 'group',
      entityId: run.id,
      payload: { mode: input.mode, devices: assignments },
    });
    this.broadcastNow();

    await Promise.allSettled(
      assignments.map(async (assignment) => {
        try {
          await this.commands.execute({
            deviceId: assignment.deviceId,
            type: 'LOAD_VIDEO',
            payload: { videoId: assignment.videoId, autoplay: false },
            actor: input.actor,
          });
        } catch (error) {
          const entry = this.run?.devices.get(assignment.deviceId);
          if (entry) {
            entry.error = error instanceof Error ? error.message : 'Failed to load video';
            entry.phase = 'error';
            this.scheduleBroadcast();
          }
        }
      }),
    );

    if (this.run !== run || run.status !== 'preparing') return this.getState();

    const allReady = [...run.devices.values()].every((device) => device.phase === 'ready');
    if (allReady) {
      await this.scheduleStart(run, input.actor);
    } else {
      run.readyTimer = setTimeout(() => {
        void this.startWhenTimedOut(run, input.actor);
      }, READY_TIMEOUT_MS);
      run.readyTimer.unref?.();
    }
    return this.getState();
  }

  private async startWhenTimedOut(run: Run, actor: string): Promise<void> {
    if (this.run !== run || run.status !== 'preparing') return;
    const ready = [...run.devices.values()].filter((device) => device.phase === 'ready');
    for (const device of run.devices.values()) {
      if (device.phase !== 'ready') {
        device.phase = 'error';
        device.error ??= 'Headset did not report ready before the start timeout';
      }
    }
    if (ready.length === 0) {
      run.status = 'error';
      run.message = 'No headset reported ready. Verify each player has a video loaded.';
      this.broadcastNow();
      return;
    }
    run.message = `${ready.length} of ${run.devices.size} headsets ready; starting available devices.`;
    await this.scheduleStart(run, actor);
  }

  private async scheduleStart(run: Run, actor: string): Promise<void> {
    if (this.run !== run || run.status !== 'preparing') return;
    if (run.readyTimer) {
      clearTimeout(run.readyTimer);
      run.readyTimer = null;
    }
    const readyDeviceIds = [...run.devices.values()]
      .filter((device) => device.phase === 'ready')
      .map((device) => device.deviceId);
    if (readyDeviceIds.length === 0) {
      run.status = 'error';
      run.message = 'No device is ready to start.';
      this.broadcastNow();
      return;
    }
    const scheduledStartAt = Date.now() + run.leadMs;
    run.scheduledStartAt = scheduledStartAt;
    run.status = 'scheduled';
    run.message = `Scheduled start in ${(run.leadMs / 1000).toFixed(1)}s.`;
    for (const device of run.devices.values()) {
      if (device.phase === 'ready') device.phase = 'scheduled';
    }
    this.broadcastNow();

    await Promise.allSettled(
      readyDeviceIds.map(async (deviceId) => {
        try {
          await this.commands.execute({
            deviceId,
            type: 'PLAY',
            payload: {
              positionSeconds: run.basePositionSeconds,
              scheduledAt: scheduledStartAt,
            },
            actor,
          });
        } catch (error) {
          const entry = this.run?.devices.get(deviceId);
          if (entry) {
            entry.phase = 'error';
            entry.error = error instanceof Error ? error.message : 'Scheduled play failed';
            this.scheduleBroadcast();
          }
        }
      }),
    );

    if (this.run !== run) return;
    const delay = Math.max(0, scheduledStartAt - Date.now());
    run.statusTimer = setTimeout(() => {
      if (this.run !== run) return;
      run.status = 'playing';
      run.message = null;
      this.broadcastNow();
    }, delay + 250);
    run.statusTimer.unref?.();
  }

  async stop(actor: string): Promise<GroupPlaybackState> {
    const run = this.run;
    if (!run) return this.getState();
    this.stopTimers();
    run.status = 'stopped';
    run.message = 'Group playback stopped by administrator.';
    const ids = [...run.devices.values()]
      .filter((device) => device.phase !== 'offline' && device.phase !== 'error')
      .map((device) => device.deviceId);
    await Promise.allSettled(
      ids.map((deviceId) =>
        this.commands.execute({
          deviceId,
          type: 'STOP',
          payload: {},
          actor,
        }),
      ),
    );
    for (const device of run.devices.values()) {
      if (device.phase !== 'offline') device.phase = 'idle';
    }
    this.broadcastNow();
    return this.getState();
  }

  onDeviceDisconnected(deviceId: string): void {
    const run = this.run;
    if (!run) return;
    const entry = run.devices.get(deviceId);
    if (!entry) return;
    entry.phase = 'offline';
    entry.error = 'Headset disconnected during group playback';
    entry.syncHealth = 'unknown';
    this.scheduleBroadcast();
  }

  private onPlaybackUpdate(deviceId: string, playback: PlaybackSnapshot): void {
    const run = this.run;
    if (!run) return;
    const entry = run.devices.get(deviceId);
    if (!entry) return;

    entry.lastSeenAt = playback.updatedAt;
    if (playback.videoId && playback.videoId !== entry.expectedVideoId) {
      // The operator changed this headset independently; it is no longer part
      // of the group run.
      entry.phase = 'error';
      entry.error = 'Video changed independently during group playback';
      this.scheduleBroadcast();
      return;
    }
    entry.positionSeconds = playback.positionSeconds;
    entry.videoId = playback.videoId;
    entry.videoName = playback.videoName ?? entry.videoName;

    if (run.status === 'preparing') {
      if (playback.state === 'ready' || playback.state === 'playing' || playback.state === 'paused') {
        if (!playback.videoId || playback.videoId === entry.expectedVideoId) {
          entry.phase = 'ready';
          entry.error = null;
          const allReady = [...run.devices.values()].every((item) => item.phase === 'ready');
          if (allReady) {
            void this.scheduleStart(run, 'system');
          }
        }
      } else if (playback.state === 'error') {
        entry.phase = 'error';
        entry.error = playback.error ?? 'Player reported an error while loading';
      }
      this.scheduleBroadcast();
      return;
    }

    if (playback.state === 'playing') entry.phase = 'playing';
    else if (playback.state === 'paused') entry.phase = 'paused';
    else if (playback.state === 'ended') entry.phase = 'ended';
    else if (playback.state === 'error') entry.phase = 'error';
    entry.error = playback.error;

    if (run.scheduledStartAt !== null && playback.state === 'playing') {
      const expected = this.expectedPosition(run, Date.parse(playback.updatedAt));
      const driftMs = (playback.positionSeconds - expected) * 1000;
      entry.driftMs = Math.round(driftMs);
      entry.syncHealth =
        Math.abs(driftMs) <= 250
          ? 'good'
          : Math.abs(driftMs) <= 1_000
            ? 'fair'
            : 'poor';
      this.correctDrift(run, entry, playback.positionSeconds, expected);
    }
    this.scheduleBroadcast();
  }

  private expectedPosition(run: Run, at: number): number {
    if (run.scheduledStartAt === null) return run.basePositionSeconds;
    return (
      run.basePositionSeconds + Math.max(0, at - run.scheduledStartAt) / 1000
    );
  }

  private correctDrift(run: Run, entry: RunDevice, actual: number, expected: number): void {
    const driftMs = (actual - expected) * 1000;
    if (Math.abs(driftMs) < DRIFT_CORRECTION_THRESHOLD_MS) return;
    const last = run.lastCorrection.get(entry.deviceId) ?? 0;
    if (Date.now() - last < DRIFT_CORRECTION_COOLDOWN_MS) return;
    run.lastCorrection.set(entry.deviceId, Date.now());
    this.state.logEvent(entry.deviceId, 'playback.drift_correction', {
      groupId: run.id,
      driftMs: Math.round(driftMs),
      targetSeconds: Math.round(expected * 1000) / 1000,
    });
    this.commands
      .execute({
        deviceId: entry.deviceId,
        type: 'SEEK',
        payload: { positionSeconds: Math.max(0, Math.round(expected * 1000) / 1000) },
        actor: 'system',
      })
      .catch(() => undefined);
  }

  private scheduleBroadcast(): void {
    if (!this.run || this.run.broadcastTimer) return;
    this.run.broadcastTimer = setTimeout(() => {
      if (this.run) this.run.broadcastTimer = null;
      this.broadcastNow();
    }, 300);
    this.run.broadcastTimer.unref?.();
  }

  private broadcastNow(): void {
    if (!this.run) return;
    if (this.run.broadcastTimer) {
      clearTimeout(this.run.broadcastTimer);
      this.run.broadcastTimer = null;
    }
    this.hub.broadcast({ kind: 'group.updated', group: this.getState() });
  }

  private stopTimers(): void {
    const run = this.run;
    if (!run) return;
    if (run.readyTimer) clearTimeout(run.readyTimer);
    if (run.statusTimer) clearTimeout(run.statusTimer);
    if (run.broadcastTimer) clearTimeout(run.broadcastTimer);
    run.readyTimer = null;
    run.statusTimer = null;
    run.broadcastTimer = null;
  }
}
