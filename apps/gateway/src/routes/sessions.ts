import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DEFAULT_SETTINGS, type AppSettings } from '@vrcc/shared-types';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { badRequest } from '../utils/errors.js';
import { parseBody, requireSession } from './helpers.js';

const settingsPatchSchema = z
  .object({
    staleAfterSeconds: z.number().int().min(5).max(120).optional(),
    seekStepSeconds: z.number().int().min(1).max(30).optional(),
    previewMaxFps: z.number().int().min(1).max(5).optional(),
    defaultVolume: z.number().min(0).max(1).optional(),
    confirmDestructiveActions: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'No settings supplied');

export async function registerSessionRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/sessions', async (request) => {
    requireSession(ctx, request);
    const query = parseBody(
      z.object({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        deviceId: uuidSchema.optional(),
      }),
      request.query,
    );
    return ctx.store.ops.listSessions(query);
  });

  app.get('/api/audit', async (request) => {
    requireSession(ctx, request);
    const query = parseBody(
      z.object({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
      }),
      request.query,
    );
    return ctx.store.ops.listAudit(query);
  });
}

export async function registerSettingsRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/settings', async (request) => {
    requireSession(ctx, request);
    return ctx.store.ops.getSettings();
  });

  app.patch('/api/settings', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const patch = parseBody(settingsPatchSchema, request.body);
    if (patch.previewMaxFps && patch.previewMaxFps > ctx.config.previewMaxFps) {
      throw badRequest(`previewMaxFps cannot exceed the gateway cap (${ctx.config.previewMaxFps})`);
    }
    const current = ctx.store.ops.getSettings();
    const merged: AppSettings = {
      ...DEFAULT_SETTINGS,
      ...current,
      ...patch,
    };
    const saved = ctx.store.ops.saveSettings(merged);
    ctx.store.ops.addAudit({
      actor: authenticated.admin.email,
      action: 'settings.updated',
      entityType: 'settings',
      entityId: null,
      payload: patch,
    });
    ctx.hub.broadcast({ kind: 'settings.updated', settings: saved });
    return saved;
  });
}
