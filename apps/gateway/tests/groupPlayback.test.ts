import { describe, expect, it, vi } from 'vitest';
import type { PlaybackSnapshot } from '@vrcc/shared-types';
import { GroupPlaybackService } from '../src/services/groupPlayback.js';

const DEVICE_ID = '11111111-1111-4111-8111-111111111111';
const VIDEO_ID = '22222222-2222-4222-8222-222222222222';

function snapshot(overrides: Partial<PlaybackSnapshot> = {}): PlaybackSnapshot {
  return {
    state: 'playing',
    videoId: VIDEO_ID,
    videoName: 'Test Video',
    positionSeconds: 0,
    durationSeconds: 120,
    volume: 1,
    positionConfirmed: true,
    error: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Group playback independent control', () => {
  it('stops drift correction for a headset an operator has taken over', async () => {
    let playbackListener: ((deviceId: string, playback: PlaybackSnapshot) => void) | null = null;
    const executed: string[] = [];

    const devices = {
      getDevice: (id: string) =>
        id === DEVICE_ID
          ? { id: DEVICE_ID, name: 'Quest A', status: 'online' }
          : null,
    };
    const videos = {
      getVideo: (id: string) =>
        id === VIDEO_ID
          ? { id: VIDEO_ID, name: 'Test Video' }
          : null,
    };
    const registry = { isConnected: () => true };
    const state = {
      onPlaybackUpdate: (listener: (deviceId: string, playback: PlaybackSnapshot) => void) => {
        playbackListener = listener;
        return () => undefined;
      },
      onDeviceDisconnected: () => () => undefined,
      logEvent: vi.fn(),
    };
    const commands = {
      execute: async (input: { type: string }) => {
        executed.push(input.type);
        return { id: 'command' };
      },
    };
    const hub = { broadcast: vi.fn() };
    const ops = { addAudit: vi.fn() };

    const service = new GroupPlaybackService(
      devices as never,
      videos as never,
      registry as never,
      state as never,
      commands as never,
      hub as never,
      ops as never,
    );

    try {
      await service.start({
        mode: 'same',
        assignments: [{ deviceId: DEVICE_ID, videoId: VIDEO_ID }],
        actor: 'admin@vrcc.local',
        leadMs: 1000,
      });

      // The headset reports ready and the group schedules a common start.
      playbackListener!(DEVICE_ID, snapshot({ state: 'ready', positionSeconds: 0 }));
      expect(service.getState().status).toBe('scheduled');

      // A large drift triggers the group's corrective seek.
      playbackListener!(
        DEVICE_ID,
        snapshot({ state: 'playing', positionSeconds: 30, updatedAt: new Date().toISOString() }),
      );
      expect(executed.filter((type) => type === 'SEEK')).toHaveLength(1);

      // Direct operator control detaches the headset from the group.
      service.detachDevice(DEVICE_ID);
      const detached = service.getState().devices.find((device) => device.deviceId === DEVICE_ID);
      expect(detached?.phase).toBe('idle');
      expect(detached?.error).toContain('independently');

      playbackListener!(
        DEVICE_ID,
        snapshot({ state: 'playing', positionSeconds: 60, updatedAt: new Date().toISOString() }),
      );
      expect(executed.filter((type) => type === 'SEEK')).toHaveLength(1);
      expect(state.logEvent).toHaveBeenCalledWith(
        DEVICE_ID,
        'playback.group_detached',
        expect.objectContaining({ groupId: expect.any(String) }),
      );
    } finally {
      service.dispose();
    }
  });
});
