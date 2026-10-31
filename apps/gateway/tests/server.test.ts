import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildServer, type BuiltServer } from '../src/server.js';

describe('Gateway HTTP & API Integration', () => {
  let server: BuiltServer;
  let testDir: string;
  let sessionCookie = '';
  let csrfToken = '';

  beforeAll(async () => {
    testDir = mkdtempSync(path.join(tmpdir(), 'vrcc-test-'));
    server = await buildServer({
      config: {
        dataDir: path.join(testDir, 'data'),
        videoDir: path.join(testDir, 'videos'),
        thumbnailDir: path.join(testDir, 'thumbs'),
        tempDir: path.join(testDir, 'temp'),
        logDir: path.join(testDir, 'logs'),
        quietLogs: true,
      },
      disableRateLimit: true,
    });
  });

  afterAll(async () => {
    await server.app.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('GET /api/health returns status ok', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('ok');
    expect(json.database).toBe('ok');
  });

  it('GET /api/config indicates bootstrap is needed initially', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/config',
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.auth.needsBootstrap).toBe(true);
  });

  it('POST /api/auth/bootstrap creates the first administrator', async () => {
    const token = server.ctx.bootstrap.activeToken;
    expect(token).toBeTruthy();

    const res = await server.app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        email: 'admin@vrcc.local',
        password: 'AdminPassword123!',
        displayName: 'Test Admin',
        token,
      },
    });

    expect(res.statusCode).toBe(201);
    const json = JSON.parse(res.payload);
    expect(json.identity.email).toBe('admin@vrcc.local');
    expect(json.identity.role).toBe('admin');
    expect(json.csrfToken).toBeTruthy();

    csrfToken = json.csrfToken;
    const cookieHeader = res.headers['set-cookie'];
    expect(cookieHeader).toBeTruthy();
    sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
  });

  it('POST /api/auth/login authenticates created administrator', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: 'admin@vrcc.local',
        password: 'AdminPassword123!',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.identity.email).toBe('admin@vrcc.local');
  });

  it('GET /api/devices lists paired devices (initially empty)', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/devices',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(res.statusCode).toBe(200);
    const list = JSON.parse(res.payload);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);
  });

  it('POST /api/devices/pairing-sessions creates challenge and operator pairs headset', async () => {
    const secretHash = 'b'.repeat(64);
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
    expect(challenge.code).toMatch(/^\d{6}$/);

    // Operator confirms the pairing code from admin dashboard
    const pairRes = await server.app.inject({
      method: 'POST',
      url: '/api/devices/pair',
      headers: {
        cookie: sessionCookie,
        'x-vrcc-csrf': csrfToken,
      },
      payload: {
        code: challenge.code,
        name: 'Headset Alpha',
      },
    });

    expect(pairRes.statusCode).toBe(200);

    // Quest polls claim endpoint
    const claimRes = await server.app.inject({
      method: 'POST',
      url: `/api/devices/pairing-sessions/${challenge.id}/claim`,
      payload: {
        pollToken: challenge.pollToken,
      },
    });

    expect(claimRes.statusCode).toBe(200);
    const claim = JSON.parse(claimRes.payload);
    expect(claim.status).toBe('paired');
    expect(claim.device.name).toBe('Headset Alpha');
    expect(claim.device.deviceId).toBeTruthy();

    // Verify it appears in device list
    const devListRes = await server.app.inject({
      method: 'GET',
      url: '/api/devices',
      headers: {
        cookie: sessionCookie,
      },
    });
    const devList = JSON.parse(devListRes.payload);
    expect(devList.length).toBe(1);
    expect(devList[0].name).toBe('Headset Alpha');
  });
});

