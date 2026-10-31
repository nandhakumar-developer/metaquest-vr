import { describe, expect, it } from 'vitest';
import {
  makeMessage,
  parseQuestMessage,
  parseDeviceCommandMessage,
  parseEnvelope,
  PROTOCOL_VERSION,
} from './index.js';
import { DEFAULT_CAPABILITIES } from '@vrcc/shared-types';

describe('Protocol Message Handling', () => {
  const deviceUuid = '11111111-2222-4333-8444-555555555555';
  const secretHex = 'a'.repeat(64);

  it('serializes and parses a valid DEVICE_AUTH message', () => {
    const raw = makeMessage('DEVICE_AUTH', deviceUuid, {
      secret: secretHex,
      appVersion: '1.0.0',
      model: 'Meta Quest 2',
      capabilities: DEFAULT_CAPABILITIES,
    });

    const parsed = parseQuestMessage(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.data.type === 'DEVICE_AUTH') {
      expect(parsed.data.type).toBe('DEVICE_AUTH');
      expect(parsed.data.deviceId).toBe(deviceUuid);
      expect(parsed.data.protocolVersion).toBe(PROTOCOL_VERSION);
      expect(parsed.data.payload.secret).toBe(secretHex);
    }
  });

  it('rejects an invalid message missing required envelope fields', () => {
    const malformed = {
      type: 'DEVICE_AUTH',
      payload: {},
    };
    const parsed = parseEnvelope(malformed);
    expect(parsed.ok).toBe(false);
  });

  it('parses HEARTBEAT and PLAYBACK_EVENT messages', () => {
    const heartbeat = makeMessage('HEARTBEAT', deviceUuid, {
      appVersion: '1.0.0',
      model: 'Meta Quest 2',
      batteryLevel: 85,
      charging: false,
      playback: {
        state: 'playing',
        videoId: null,
        videoName: null,
        positionSeconds: 12.5,
        durationSeconds: 120,
        volume: 0.9,
        positionConfirmed: true,
        error: null,
        updatedAt: new Date().toISOString(),
      },
      inventoryCount: 3,
      storage: { freeBytes: 1000, totalBytes: 2000 },
      uptimeSeconds: 400,
    });

    const parsed = parseQuestMessage(JSON.stringify(heartbeat));
    expect(parsed.ok).toBe(true);
  });

  it('parses gateway device commands like PLAY, SEEK, and LOAD_VIDEO', () => {
    const playCmd = makeMessage('PLAY', deviceUuid, { positionSeconds: 10 });
    const parsedPlay = parseDeviceCommandMessage(JSON.stringify(playCmd));
    expect(parsedPlay.ok).toBe(true);

    const seekCmd = makeMessage('SEEK', deviceUuid, { positionSeconds: 45.2 });
    const parsedSeek = parseDeviceCommandMessage(JSON.stringify(seekCmd));
    expect(parsedSeek.ok).toBe(true);

    const loadCmd = makeMessage('LOAD_VIDEO', deviceUuid, {
      videoId: '22222222-3333-4444-8555-666666666666',
    });
    const parsedLoad = parseDeviceCommandMessage(JSON.stringify(loadCmd));
    expect(parsedLoad.ok).toBe(true);
  });
});
