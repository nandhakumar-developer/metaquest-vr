import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { buildServer, listen, type BuiltServer } from '../src/server.js';
import { makeMessage, parseDeviceCommandMessage } from '@vrcc/protocol';
import { DEFAULT_CAPABILITIES } from '@vrcc/shared-types';

describe('Quest WebSocket Protocol & Device Lifecycle', () => {
  let server: BuiltServer;
  let testDir: string;
  let serverPort: number;
  let wsUrl: string;

  beforeAll(async () => {
    testDir = mkdtempSync(path.join(tmpdir(), 'vrcc-ws-test-'));
    serverPort = 4455;
    server = await buildServer({
      config: {
        port: serverPort,
        dataDir: path.join(testDir, 'data'),
        videoDir: path.join(testDir, 'videos'),
        thumbnailDir: path.join(testDir, 'thumbs'),
        tempDir: path.join(testDir, 'temp'),
        logDir: path.join(testDir, 'logs'),
        quietLogs: true,
      },
      disableRateLimit: true,
    });
    await listen(server.app, '127.0.0.1', serverPort);
    wsUrl = `ws://127.0.0.1:${serverPort}/ws?role=device`;
  });

  afterAll(async () => {
    await server.app.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('handles device pairing, WebSocket authentication, and command dispatch', async () => {
    // 1. Create a pairing challenge
    const secretHex = 'c'.repeat(64);
    const secretHash = createHash('sha256').update(secretHex).digest('hex');
    const challengeRes = await server.app.inject({
      method: 'POST',
      url: '/api/devices/pairing-sessions',
      payload: {
        secretHash,
        model: 'Meta Quest 2',
        appVersion: '1.0.0',
      },
    });
    expect(challengeRes.statusCode).toBe(201);
    const challenge = JSON.parse(challengeRes.payload);

    // Bootstrap an admin to confirm pairing
    const token = server.ctx.bootstrap.activeToken;
    const bootRes = await server.app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        email: 'op@vrcc.local',
        password: 'Password123!45',
        token,
      },
    });
    const bootJson = JSON.parse(bootRes.payload);
    const sessionCookie = bootRes.headers['set-cookie'] as string;
    const csrfToken = bootJson.csrfToken;

    // Operator confirms pairing code
    const pairRes = await server.app.inject({
      method: 'POST',
      url: '/api/devices/pair',
      headers: { cookie: sessionCookie, 'x-vrcc-csrf': csrfToken },
      payload: { code: challenge.code, name: 'Simulated Quest Headset' },
    });
    expect(pairRes.statusCode).toBe(200);

    // Quest claims session
    const claimRes = await server.app.inject({
      method: 'POST',
      url: `/api/devices/pairing-sessions/${challenge.id}/claim`,
      payload: { pollToken: challenge.pollToken },
    });
    expect(claimRes.statusCode).toBe(200);
    const claim = JSON.parse(claimRes.payload);
    const deviceUuid = claim.device.deviceUuid;
    const deviceId = claim.device.deviceId;

    // 2. Connect WebSocket
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        // Send DEVICE_AUTH
        const authMsg = makeMessage('DEVICE_AUTH', deviceUuid, {
          secret: secretHex,
          appVersion: '1.0.0',
          model: 'Meta Quest 2',
          capabilities: DEFAULT_CAPABILITIES,
        });
        ws.send(JSON.stringify(authMsg));
      });

      ws.on('message', (raw) => {
        const parsed = parseDeviceCommandMessage(raw.toString());
        if (parsed.ok && parsed.data.type === 'AUTH_OK') {
          resolve();
        } else if (parsed.ok && parsed.data.type === 'AUTH_ERROR') {
          reject(new Error(`AUTH_ERROR: ${JSON.stringify(parsed.data.payload)}`));
        }
      });

      ws.on('error', reject);
    });

    // 3. Verify device is online in registry & state
    expect(server.ctx.registry.isConnected(deviceId)).toBe(true);
    const devDto = server.ctx.state.getDeviceDto(deviceId);
    expect(devDto.online).toBe(true);

    // 4. Send a PLAY command via REST
    const playPromise = server.ctx.commands.execute({
      deviceId,
      type: 'PLAY',
      payload: { positionSeconds: 15 },
      actor: 'test-runner',
    });

    // Listen on WebSocket for PLAY command and reply with COMMAND_ACK
    await new Promise<void>((resolve) => {
      ws.on('message', (raw) => {
        const parsed = parseDeviceCommandMessage(raw.toString());
        if (parsed.ok && parsed.data.type === 'PLAY') {
          const ack = makeMessage('COMMAND_ACK', deviceUuid, {
            commandId: parsed.data.messageId,
            success: true,
          });
          ws.send(JSON.stringify(ack));
          resolve();
        }
      });
    });

    const commandResult = await playPromise;
    expect(commandResult.status).toBe('acknowledged');

    await new Promise<void>((resolve) => {
      ws.on('close', () => resolve());
      ws.close();
    });
  });
});

