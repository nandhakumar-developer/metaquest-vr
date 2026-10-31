import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../src/server.js';

const SAMPLE_SECRET = 'd'.repeat(64);

describe('Browser player pairing, library and streaming', () => {
  let server: BuiltServer;
  let testDir: string;
  let sessionCookie = '';
  let csrfToken = '';
  let deviceUuid = '';
  let videoId = '';
  let streamUrl = '';
  let streamBody = Buffer.alloc(0);

  beforeAll(async () => {
    testDir = mkdtempSync(path.join(tmpdir(), 'vrcc-player-test-'));
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

    // Provision an administrator for pairing and group API tests.
    const bootstrap = await server.app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        email: 'player-admin@vrcc.local',
        password: 'AdminPassword123!',
        displayName: 'Player Test Admin',
        token: server.ctx.bootstrap.activeToken,
      },
    });
    expect(bootstrap.statusCode).toBe(201);
    const bootJson = JSON.parse(bootstrap.payload);
    csrfToken = bootJson.csrfToken;
    const cookieHeader = bootstrap.headers['set-cookie'];
    sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
    expect(sessionCookie).toBeTruthy();

    // Create a small real file and matching video record for range tests.
    streamBody = Buffer.alloc(2048);
    for (let i = 0; i < streamBody.length; i += 1) streamBody[i] = i % 251;
    videoId = randomUUID();
    writeFileSync(path.join(testDir, 'videos', 'sample.mp4'), streamBody);
    server.ctx.store.videos.createVideo({
      id: videoId,
      name: 'Range Test Clip',
      originalFilename: 'sample.mp4',
      storagePath: 'sample.mp4',
      sizeBytes: streamBody.length,
      durationSeconds: 12,
      width: 1920,
      height: 960,
      frameRate: 30,
      videoCodec: 'h264',
      audioCodec: 'aac',
      projectionType: '360',
      stereoLayout: 'mono',
      checksum: createHash('sha256').update(streamBody).digest('hex'),
      thumbnailPath: null,
      compatibility: 'unverified',
      compatibilityNotes: 'No probe',
    });
  });

  afterAll(async () => {
    await server.app.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('start -> admin confirm -> claim pairs the browser player', async () => {
    const secretHash = createHash('sha256').update(SAMPLE_SECRET).digest('hex');
    const startRes = await server.app.inject({
      method: 'POST',
      url: '/api/player/pair/start',
      payload: {
        secretHash,
        model: 'Meta Quest 2',
        appVersion: '1.0.0-browser',
      },
    });
    expect(startRes.statusCode).toBe(201);
    const start = JSON.parse(startRes.payload);
    expect(start.code).toMatch(/^\d{6}$/);
    expect(start.pollToken).toBeTruthy();

    const pendingClaim = await server.app.inject({
      method: 'POST',
      url: '/api/player/pair/claim',
      payload: { pairingId: start.pairingId, pollToken: start.pollToken },
    });
    expect(pendingClaim.statusCode).toBe(200);
    expect(JSON.parse(pendingClaim.payload).status).toBe('pending');

    const pairRes = await server.app.inject({
      method: 'POST',
      url: '/api/devices/pair',
      headers: { cookie: sessionCookie, 'x-vrcc-csrf': csrfToken },
      payload: { code: start.code, name: 'Quest Browser A' },
    });
    expect(pairRes.statusCode).toBe(200);

    const claimRes = await server.app.inject({
      method: 'POST',
      url: '/api/player/pair/claim',
      payload: { pairingId: start.pairingId, pollToken: start.pollToken },
    });
    expect(claimRes.statusCode).toBe(200);
    const claim = JSON.parse(claimRes.payload);
    expect(claim.status).toBe('paired');
    expect(claim.device.name).toBe('Quest Browser A');
    expect(claim.device.deviceUuid).toMatch(/^[0-9a-f-]{36}$/i);
    deviceUuid = claim.device.deviceUuid;
  });

  it('session returns the shared library with signed media URLs', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/player/session',
      payload: { deviceUuid, secret: SAMPLE_SECRET },
    });
    expect(res.statusCode).toBe(200);
    const session = JSON.parse(res.payload);
    expect(session.device.name).toBe('Quest Browser A');
    expect(session.videos).toHaveLength(1);
    const video = session.videos[0];
    expect(video.id).toBe(videoId);
    expect(video.streamUrl).toContain(`/api/player/stream/${videoId}`);
    streamUrl = video.streamUrl;
  });

  it('rejects a wrong device secret', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/player/session',
      payload: { deviceUuid, secret: 'e'.repeat(64) },
    });
    expect(res.statusCode).toBe(401);
  });

  it('stream-ticket re-issues a signed URL for a known video', async () => {
    const res = await server.app.inject({
      method: 'POST',
      url: '/api/player/stream-ticket',
      payload: { deviceUuid, secret: SAMPLE_SECRET, videoId },
    });
    expect(res.statusCode).toBe(200);
    const ticket = JSON.parse(res.payload);
    expect(ticket.videoId).toBe(videoId);
    expect(ticket.streamUrl).toContain(`/api/player/stream/${videoId}`);
  });

  it('serves byte ranges with 206 and the requested content', async () => {
    const parsed = new URL(streamUrl);
    const res = await server.app.inject({
      method: 'GET',
      url: `${parsed.pathname}${parsed.search}`,
      headers: { range: 'bytes=10-19' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 10-19/${streamBody.length}`);
    expect(res.rawPayload.equals(streamBody.subarray(10, 20))).toBe(true);
  });

  it('rejects a tampered media ticket', async () => {
    const parsed = new URL(streamUrl);
    const res = await server.app.inject({
      method: 'GET',
      url: `${parsed.pathname}?exp=${parsed.searchParams.get('exp')}&token=not-a-valid-token`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a stale media ticket', async () => {
    const parsed = new URL(streamUrl);
    const res = await server.app.inject({
      method: 'GET',
      url: `${parsed.pathname}?exp=1&token=${parsed.searchParams.get('token')}`,
    });
    expect(res.statusCode).toBe(403);
  });

  it('exposes the player URL and QR for the pairing modal', async () => {
    const res = await server.app.inject({
      method: 'GET',
      url: '/api/player/link',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const link = JSON.parse(res.payload);
    expect(link.playerUrl).toContain('/player/');
    expect(link.qrDataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  describe('group playback API validation', () => {
    it('requires an authenticated administrator for group state', async () => {
      const res = await server.app.inject({ method: 'GET', url: '/api/playback/group' });
      expect(res.statusCode).toBe(401);
    });

    it('starts idle and rejects an empty group selection', async () => {
      const stateRes = await server.app.inject({
        method: 'GET',
        url: '/api/playback/group',
        headers: { cookie: sessionCookie },
      });
      expect(stateRes.statusCode).toBe(200);
      expect(JSON.parse(stateRes.payload).status).toBe('idle');

      const startRes = await server.app.inject({
        method: 'POST',
        url: '/api/playback/group/start',
        headers: { cookie: sessionCookie, 'x-vrcc-csrf': csrfToken },
        payload: {},
      });
      expect(startRes.statusCode).toBe(400);
    });

    it('returns 404 for a group assignment to an unknown headset', async () => {
      const res = await server.app.inject({
        method: 'POST',
        url: '/api/playback/group/start',
        headers: { cookie: sessionCookie, 'x-vrcc-csrf': csrfToken },
        payload: {
          assignments: [{ deviceId: randomUUID(), videoId }],
          leadMs: 3000,
        },
      });
      expect(res.statusCode).toBe(404);
    });

    it('rejects a group start without a CSRF token', async () => {
      const res = await server.app.inject({
        method: 'POST',
        url: '/api/playback/group/start',
        headers: { cookie: sessionCookie },
        payload: { assignments: [{ deviceId: randomUUID(), videoId }] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('stop returns to a stopped idle run', async () => {
      const res = await server.app.inject({
        method: 'POST',
        url: '/api/playback/group/stop',
        headers: { cookie: sessionCookie, 'x-vrcc-csrf': csrfToken },
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).status).toBe('idle');
    });
  });
});
