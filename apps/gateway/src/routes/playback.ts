import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { badRequest } from '../utils/errors.js';
import { parseBody, requireSession } from './helpers.js';

const assignmentSchema = z
  .object({
    deviceId: uuidSchema,
    videoId: uuidSchema,
  })
  .strict();

const startBody = z
  .object({
    deviceIds: z.array(uuidSchema).min(1).max(32).optional(),
    videoId: uuidSchema.optional(),
    assignments: z.array(assignmentSchema).min(1).max(32).optional(),
    leadMs: z.number().int().min(1_000).max(10_000).optional(),
    positionSeconds: z.number().min(0).max(86_400).optional(),
  })
  .strict();

export async function registerPlaybackRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/playback/group', async (request) => {
    requireSession(ctx, request);
    return ctx.groupPlayback.getState();
  });

  app.post('/api/playback/group/start', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const body = parseBody(startBody, request.body);

    let assignments = body.assignments ?? [];
    if (assignments.length === 0) {
      if (!body.deviceIds || body.deviceIds.length === 0) {
        throw badRequest('Select at least one headset');
      }
      if (!body.videoId) throw badRequest('Choose a video for the selected headsets');
      assignments = body.deviceIds.map((deviceId) => ({ deviceId, videoId: body.videoId! }));
    }

    const distinctVideos = new Set(assignments.map((entry) => entry.videoId));
    const group = await ctx.groupPlayback.start({
      mode: distinctVideos.size > 1 ? 'mixed' : 'same',
      assignments,
      leadMs: body.leadMs,
      positionSeconds: body.positionSeconds,
      actor: authenticated.admin.email,
    });
    return group;
  });

  app.post('/api/playback/group/stop', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    return ctx.groupPlayback.stop(authenticated.admin.email);
  });
}
