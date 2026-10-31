import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, promises as fs } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROJECTION_TYPES, STEREO_LAYOUTS } from '@vrcc/shared-types';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { AppError, badRequest, notFound, payloadTooLarge } from '../utils/errors.js';
import { newId, resolveInside } from '../utils/ids.js';
import { parseBody, requireSession } from './helpers.js';
import { contentTypeForFilename, parseRangeHeader } from '../utils/httpRange.js';

const ALLOWED_EXTENSIONS = new Set(['.mp4', '.m4v', '.mov', '.mkv', '.webm']);
const MAX_FILENAME_LENGTH = 255;

const videoParams = z.object({ videoId: uuidSchema });
const deploymentParams = z.object({ deploymentId: uuidSchema });
const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    projectionType: z.enum(PROJECTION_TYPES).optional(),
    stereoLayout: z.enum(STEREO_LAYOUTS).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No changes supplied');
const deployBody = z.object({ deviceIds: z.array(uuidSchema).min(1).max(64) }).strict();

function readField(fields: Record<string, unknown>, key: string): string | undefined {
  const field = fields[key];
  const item = Array.isArray(field) ? field[0] : field;
  if (!item || typeof item !== 'object') return undefined;
  const value = (item as { value?: unknown }).value;
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export async function registerVideoRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/videos', async (request) => {
    requireSession(ctx, request);
    return ctx.videos.list();
  });

  app.get('/api/videos/:videoId', async (request) => {
    requireSession(ctx, request);
    const { videoId } = parseBody(videoParams, request.params);
    return ctx.videos.getDto(videoId);
  });

  app.post('/api/videos', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const file = await request.file();
    if (!file) throw badRequest('No video file was uploaded');
    const fields = file.fields as unknown as Record<string, unknown>;

    const extension = path.extname(file.filename ?? '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new AppError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        `Unsupported container "${extension || 'unknown'}". Allowed: ${[...ALLOWED_EXTENSIONS].join(
          ', ',
        )}. Use FFmpeg to remux/transcode.`,
      );
    }
    if (!file.filename || file.filename.length > MAX_FILENAME_LENGTH) {
      throw badRequest('Invalid filename');
    }

    const meta = parseBody(
      z
        .object({
          name: z.string().trim().max(200).optional(),
          projectionType: z.enum(PROJECTION_TYPES).default('flat'),
          stereoLayout: z.enum(STEREO_LAYOUTS).default('mono'),
        })
        .strict(),
      {
        name: readField(fields, 'name') || undefined,
        projectionType: readField(fields, 'projectionType') || undefined,
        stereoLayout: readField(fields, 'stereoLayout') || undefined,
      },
    );

    const tempPath = resolveInside(ctx.config.tempDir, `upload-${newId()}.part`);
    const hash = createHash('sha256');
    let size = 0;
    let consumed = false;
    try {
      const hasher = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          size += chunk.length;
          callback(null, chunk);
        },
      });
      await pipeline(file.file, hasher, createWriteStream(tempPath, { mode: 0o600 }));
      if (file.file.truncated) {
        throw payloadTooLarge(
          `Upload exceeds the ${ctx.config.maxVideoUploadBytes} byte limit`,
        );
      }
      if (size === 0) throw badRequest('Uploaded file is empty');
      const checksum = hash.digest('hex');
      const video = await ctx.videos.ingest({
        tempPath,
        originalFilename: file.filename,
        sizeBytes: size,
        checksum,
        name: meta.name ?? path.parse(file.filename).name,
        projectionType: meta.projectionType,
        stereoLayout: meta.stereoLayout,
      });
      consumed = true;
      ctx.store.ops.addAudit({
        actor: authenticated.admin.email,
        action: 'video.uploaded',
        entityType: 'video',
        entityId: video.id,
        payload: { name: video.name, sizeBytes: video.sizeBytes },
      });
      return reply.code(201).send(video);
    } finally {
      if (!consumed) await fs.unlink(tempPath).catch(() => undefined);
    }
  });

  app.patch('/api/videos/:videoId', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { videoId } = parseBody(videoParams, request.params);
    const body = parseBody(updateBody, request.body);
    return ctx.videos.update(videoId, body, authenticated.admin.email);
  });

  app.delete('/api/videos/:videoId', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { videoId } = parseBody(videoParams, request.params);
    await ctx.videos.delete(videoId, authenticated.admin.email);
    return reply.code(204).send();
  });

  app.get('/api/videos/:videoId/stream', async (request, reply) => {
    requireSession(ctx, request);
    const { videoId } = parseBody(videoParams, request.params);
    const video = ctx.videos.get(videoId);
    const absolute = ctx.videos.absolutePath(video);
    const stat = await fs.stat(absolute);
    const etag = `"${video.checksum.slice(0, 32)}"`;
    if (request.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }
    const parsed = parseRangeHeader(request.headers.range, stat.size);
    reply.header('Accept-Ranges', 'bytes');
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'private, no-cache');
    reply.header('Content-Type', contentTypeForFilename(video.storagePath));
    reply.header(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(video.name)}`,
    );
    if (parsed.kind === 'invalid') {
      reply.header('Content-Range', `bytes */${stat.size}`);
      return reply.code(416).send({ error: { code: 'RANGE_NOT_SATISFIABLE', message: 'Invalid range' } });
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

  app.get('/api/videos/:videoId/thumbnail', async (request, reply) => {
    requireSession(ctx, request);
    const { videoId } = parseBody(videoParams, request.params);
    const video = ctx.videos.get(videoId);
    const thumbnail = ctx.videos.thumbnailPath(video);
    if (!thumbnail) throw notFound('Thumbnail is not available');
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(createReadStream(thumbnail));
  });

  app.post('/api/videos/:videoId/deployments', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { videoId } = parseBody(videoParams, request.params);
    const body = parseBody(deployBody, request.body);
    const result = await ctx.deployments.deploy({
      videoId,
      deviceIds: body.deviceIds,
      actor: authenticated.admin.email,
    });
    return reply.code(202).send(result);
  });

  app.get('/api/deployments', async (request) => {
    requireSession(ctx, request);
    const query = parseBody(
      z.object({
        deviceId: uuidSchema.optional(),
        videoId: uuidSchema.optional(),
        limit: z.coerce.number().int().min(1).max(500).default(200),
      }),
      request.query,
    );
    return ctx.deployments.list(query);
  });

  app.get('/api/deployments/:deploymentId', async (request) => {
    requireSession(ctx, request);
    const { deploymentId } = parseBody(deploymentParams, request.params);
    return ctx.deployments.get(deploymentId);
  });

  app.post('/api/deployments/:deploymentId/cancel', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deploymentId } = parseBody(deploymentParams, request.params);
    return ctx.deployments.cancel(deploymentId, authenticated.admin.email);
  });
}
