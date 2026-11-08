import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { toDataURL } from 'qrcode';
import { z } from 'zod';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { notFound } from '../utils/errors.js';
import { contentTypeForFilename, parseRangeHeader } from '../utils/httpRange.js';
import { clientIp, parseBody, playerUrlForRequest, requireSession } from './helpers.js';

const secretSchema = z.string().regex(/^[0-9a-f]{64}$/i, 'A 64-character hex secret is required');
const deviceAuthBody = z
  .object({
    deviceUuid: uuidSchema,
    secret: secretSchema,
  })
  .strict();

/**
 * Public-with-capability endpoints used by the browser-based Quest player.
 * Pairing itself is initiated by the headset, confirmed by an authenticated
 * administrator, and bound to a one-time secret that never leaves the device.
 */
export async function registerPlayerRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/player/bootstrap', async (request) => ({
    playerUrl: playerUrlForRequest(request, ctx),
    wsPath: '/ws',
    protocolVersion: 1,
    serverTime: new Date().toISOString(),
    secureContextRequiredForWebXr: true,
  }));

  // Public so a headset can install the local root before the browser trusts
  // the HTTPS player. The CA private key is never exposed.
  app.get('/api/player/ca-cert', async (_request, reply) => {
    if (!ctx.config.tlsCertPath) throw notFound('HTTPS is not enabled on this gateway.');
    const caPath = path.join(path.dirname(ctx.config.tlsCertPath), 'local-ca.crt');
    if (!existsSync(caPath)) throw notFound('The local CA certificate is not available.');
    reply.header('Content-Type', 'application/x-x509-ca-cert');
    reply.header('Content-Disposition', 'attachment; filename="vrcc-local-ca.crt"');
    return reply.send(createReadStream(caPath));
  });

  app.post(
    '/api/player/pair/start',
    { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const body = parseBody(
        z
          .object({
            secretHash: z.string().regex(/^[0-9a-f]{64}$/i),
            model: z.string().trim().min(1).max(96),
            appVersion: z.string().trim().min(1).max(64),
          })
          .strict(),
        request.body,
      );
      const challenge = await ctx.pairing.createChallenge({
        secretHash: body.secretHash,
        model: body.model,
        appVersion: body.appVersion,
        ipAddress: clientIp(request),
      });
      return reply.code(201).send({
        pairingId: challenge.id,
        code: challenge.code,
        pollToken: challenge.pollToken,
        expiresAt: challenge.expiresAt,
        expiresInSeconds: challenge.expiresInSeconds,
        playerUrl: playerUrlForRequest(request, ctx),
        wsUrl: ctx.urls.wsUrl,
        claimIntervalMs: 1_500,
      });
    },
  );

  app.post(
    '/api/player/pair/claim',
    { config: { rateLimit: { max: 1200, timeWindow: '5 minutes' } } },
    async (request) => {
      const body = parseBody(
        z
          .object({
            pairingId: uuidSchema,
            pollToken: z.string().min(20).max(300),
          })
          .strict(),
        request.body,
      );
      return ctx.pairing.claimWithToken({
        pairingId: body.pairingId,
        pollToken: body.pollToken,
      });
    },
  );

  app.post(
    '/api/player/session',
    { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } },
    async (request) => {
      const body = parseBody(deviceAuthBody, request.body);
      const device = ctx.playerMedia.authenticate(body.deviceUuid, body.secret);
      return ctx.playerMedia.sessionFor(device);
    },
  );

  app.post(
    '/api/player/stream-ticket',
    { config: { rateLimit: { max: 120, timeWindow: '5 minutes' } } },
    async (request) => {
      const body = parseBody(
        deviceAuthBody.extend({ videoId: uuidSchema }).strict(),
        request.body,
      );
      ctx.playerMedia.authenticate(body.deviceUuid, body.secret);
      const video = ctx.videos.get(body.videoId);
      const item = ctx.playerMedia.toItem(video);
      return {
        videoId: video.id,
        streamUrl: item.streamUrl,
        thumbnailUrl: item.thumbnailUrl,
        projectionType: item.projectionType,
        stereoLayout: item.stereoLayout,
        durationSeconds: item.durationSeconds,
      };
    },
  );

  app.get('/api/player/stream/:videoId', async (request, reply) => {
    const { videoId } = parseBody(z.object({ videoId: uuidSchema }), request.params);
    const query = parseBody(
      z
        .object({
          exp: z.string().min(1).max(20),
          token: z.string().min(10).max(200),
        })
        .strict(),
      request.query,
    );
    ctx.playerMedia.verifyTicket(videoId, query.exp, query.token);
    const video = ctx.videos.get(videoId);
    const absolute = ctx.videos.absolutePath(video);
    const stat = await fs.stat(absolute);
    const parsed = parseRangeHeader(request.headers.range, stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('Cache-Control', 'private, max-age=300');
    reply.header('Content-Type', contentTypeForFilename(video.storagePath));
    if (parsed.kind === 'invalid') {
      reply.header('Content-Range', `bytes */${stat.size}`);
      return reply
        .code(416)
        .send({ error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Invalid byte range' } });
    }
    if (parsed.kind === 'range') {
      const { start, end } = parsed.range;
      reply.code(206);
      reply.header('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      reply.header('Content-Length', end - start + 1);
      return reply.send(createReadStream(absolute, { start, end }));
    }
    reply.header('Content-Length', stat.size);
    return reply.send(createReadStream(absolute));
  });

  app.get('/api/player/thumbnail/:videoId', async (request, reply) => {
    const { videoId } = parseBody(z.object({ videoId: uuidSchema }), request.params);
    const query = parseBody(
      z
        .object({
          exp: z.string().min(1).max(20),
          token: z.string().min(10).max(200),
        })
        .strict(),
      request.query,
    );
    ctx.playerMedia.verifyTicket(videoId, query.exp, query.token);
    const video = ctx.videos.get(videoId);
    const thumbnail = ctx.videos.thumbnailPath(video);
    if (!thumbnail) throw notFound('Thumbnail is not available');
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(createReadStream(thumbnail));
  });

  /** Admin helper: LAN player URL + QR for the Add Quest screen. */
  app.get('/api/player/link', async (request) => {
    requireSession(ctx, request);
    const playerUrl = playerUrlForRequest(request, ctx);
    const dataUrl = await toDataURL(playerUrl, {
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#e6edf7', light: '#0b0f16' },
    });
    return { playerUrl, qrDataUrl: dataUrl };
  });
}
