import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer, type BuiltServer } from '../src/server.js';

describe('Dashboard video upload -> shared Quest library', () => {
  let server: BuiltServer;
  let testDir: string;
  let sessionCookie = '';
  let csrfToken = '';

  beforeAll(async () => {
    testDir = mkdtempSync(path.join(tmpdir(), 'vrcc-upload-test-'));
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

    const bootstrap = await server.app.inject({
      method: 'POST',
      url: '/api/auth/bootstrap',
      payload: {
        email: 'upload-admin@vrcc.local',
        password: 'AdminPassword123!',
        displayName: 'Upload Test Admin',
        token: server.ctx.bootstrap.activeToken,
      },
    });
    expect(bootstrap.statusCode).toBe(201);
    csrfToken = JSON.parse(bootstrap.payload).csrfToken;
    const cookieHeader = bootstrap.headers['set-cookie'];
    sessionCookie = Array.isArray(cookieHeader) ? cookieHeader[0] : (cookieHeader as string);
  });

  afterAll(async () => {
    await server.app.close();
    rmSync(testDir, { recursive: true, force: true });
  });

  it('stores a multipart upload and exposes it to the player library', async () => {
    const body = Buffer.from('tiny-uploaded-video-placeholder');
    const form = new FormData();
    form.append('name', 'Uploaded From Dashboard');
    form.append('projectionType', 'flat');
    form.append('stereoLayout', 'mono');
    form.append('file', new Blob([body], { type: 'video/mp4' }), 'dashboard-upload.mp4');
    const encoded = new Response(form);
    const contentType = encoded.headers.get('content-type');
    expect(contentType).toContain('multipart/form-data');

    const upload = await server.app.inject({
      method: 'POST',
      url: '/api/videos',
      headers: {
        cookie: sessionCookie,
        'x-vrcc-csrf': csrfToken,
        'content-type': contentType!,
      },
      payload: Buffer.from(await encoded.arrayBuffer()),
    });
    expect(upload.statusCode).toBe(201);
    const uploaded = JSON.parse(upload.payload);
    expect(uploaded.name).toBe('Uploaded From Dashboard');
    expect(uploaded.checksum).toBe(createHash('sha256').update(body).digest('hex'));

    const playerLibrary = server.ctx.playerMedia.library();
    expect(playerLibrary).toHaveLength(1);
    expect(playerLibrary[0].id).toBe(uploaded.id);
    expect(playerLibrary[0].streamUrl).toContain(`/api/player/stream/${uploaded.id}`);

    const list = await server.app.inject({
      method: 'GET',
      url: '/api/videos',
      headers: { cookie: sessionCookie },
    });
    expect(list.statusCode).toBe(200);
    const videos = JSON.parse(list.payload);
    expect(videos).toHaveLength(1);
    expect(videos[0].id).toBe(uploaded.id);
    expect(server.ctx.store.videos.findByChecksum(uploaded.checksum)?.name).toBe(
      'Uploaded From Dashboard',
    );
  });
});
