import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COMMAND_TYPES } from '@vrcc/shared-types';
import { uuidSchema } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { clientIp, parseBody, requireSession } from './helpers.js';

const deviceParams = z.object({ deviceId: uuidSchema });
const commandBody = z
  .object({
    type: z.enum(COMMAND_TYPES),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const commandGroupBody = z
  .object({
    deviceIds: z.array(uuidSchema).min(1).max(64),
    type: z.enum(COMMAND_TYPES),
    payload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
const renameBody = z.object({ name: z.string().trim().min(2).max(64) }).strict();
const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export async function registerDeviceRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/devices', async (request) => {
    requireSession(ctx, request);
    return ctx.state.listDevices();
  });

  app.get('/api/devices/:deviceId', async (request) => {
    requireSession(ctx, request);
    const { deviceId } = parseBody(deviceParams, request.params);
    return ctx.state.getDeviceDto(deviceId);
  });

  app.patch('/api/devices/:deviceId', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    const body = parseBody(renameBody, request.body);
    return ctx.state.renameDevice(deviceId, body.name, authenticated.admin.email);
  });

  app.post('/api/devices/:deviceId/unpair', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    ctx.commands.failPendingForDevice(deviceId, 'Device was unpaired');
    return ctx.state.revokeDevice(deviceId, authenticated.admin.email);
  });

  app.delete('/api/devices/:deviceId', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    const connection = ctx.registry.get(deviceId);
    ctx.commands.failPendingForDevice(deviceId, 'Device was removed');
    if (connection) {
      try {
        connection.socket.close(4001, 'Device removed by administrator');
      } catch {
        // Ignore.
      }
      ctx.registry.detach(deviceId, connection.socket);
      ctx.preview.onDeviceDisconnected(deviceId);
    }
    ctx.state.deleteDevice(deviceId, authenticated.admin.email);
    return reply.code(204).send();
  });

  app.post('/api/devices/:deviceId/commands', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    const body = parseBody(commandBody, request.body);
    const command = await ctx.commands.execute({
      deviceId,
      type: body.type,
      payload: body.payload,
      actor: authenticated.admin.email,
    });
    return { command };
  });

  app.post('/api/commands/group', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const body = parseBody(commandGroupBody, request.body);
    const results = await ctx.commands.executeForDevices({
      deviceIds: body.deviceIds,
      type: body.type,
      payload: body.payload,
      actor: authenticated.admin.email,
    });
    return { results };
  });

  app.get('/api/commands', async (request) => {
    requireSession(ctx, request);
    const query = parseBody(
      z.object({
        page: z.coerce.number().int().min(1).max(100_000).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        deviceId: uuidSchema.optional(),
      }),
      request.query,
    );
    return ctx.commands.getHistory(query);
  });

  app.get('/api/devices/:deviceId/logs', async (request) => {
    requireSession(ctx, request);
    const { deviceId } = parseBody(deviceParams, request.params);
    ctx.state.getDevice(deviceId);
    const query = parseBody(paginationQuery, request.query);
    return ctx.store.ops.listDeviceLogs(deviceId, query);
  });

  app.get('/api/devices/:deviceId/video-inventory', async (request) => {
    requireSession(ctx, request);
    const { deviceId } = parseBody(deviceParams, request.params);
    ctx.state.getDevice(deviceId);
    return { items: ctx.store.devices.listDeviceVideos(deviceId) };
  });

  app.post('/api/devices/:deviceId/preview', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    const body = parseBody(
      z.object({ mode: z.enum(['snapshot', 'webrtc']).default('snapshot') }).strict(),
      request.body,
    );
    return ctx.preview.start({
      deviceId,
      mode: body.mode,
      actor: authenticated.admin.email,
    });
  });

  app.delete('/api/devices/:deviceId/preview', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { deviceId } = parseBody(deviceParams, request.params);
    await ctx.preview.stop({ deviceId, actor: authenticated.admin.email });
    return reply.code(204).send();
  });

  app.get('/api/devices/pairing-sessions', async (request) => {
    requireSession(ctx, request);
    return ctx.pairing.listPending();
  });

  app.post('/api/devices/pairing-sessions', async (request, reply) => {
    const body = parseBody(
      z
        .object({
          secretHash: z.string().regex(/^[0-9a-f]{64}$/i, 'SHA-256 hex required'),
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
    return reply.code(201).send(challenge);
  });

  app.post('/api/devices/pairing-sessions/:pairingId/claim', async (request) => {
    const { pairingId } = parseBody(z.object({ pairingId: uuidSchema }), request.params);
    const body = parseBody(
      z.object({ pollToken: z.string().min(20).max(300) }).strict(),
      request.body,
    );
    return ctx.pairing.claimWithToken({ pairingId, pollToken: body.pollToken });
  });

  app.post('/api/devices/pair', async (request) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const body = parseBody(
      z
        .object({
          code: z.string().regex(/^\d{6}$/, 'Six digit pairing code required'),
          name: z.string().trim().min(2).max(64),
        })
        .strict(),
      request.body,
    );
    return ctx.pairing.confirmPairing({
      code: body.code,
      name: body.name,
      actor: authenticated.admin.email,
    });
  });

  app.delete('/api/devices/pairing-sessions/:pairingId', async (request, reply) => {
    const authenticated = requireSession(ctx, request, { operator: true });
    const { pairingId } = parseBody(z.object({ pairingId: uuidSchema }), request.params);
    ctx.pairing.cancel(pairingId, authenticated.admin.email);
    return reply.code(204).send();
  });

  app.get('/api/devices/pairing-sessions/:pairingId/qr', async (request) => {
    requireSession(ctx, request);
    const { pairingId } = parseBody(z.object({ pairingId: uuidSchema }), request.params);
    return ctx.pairing.qrForPairing(pairingId);
  });

  app.get('/api/devices/pairing-sessions/pending', async (request) => {
    requireSession(ctx, request);
    return ctx.pairing.listPending();
  });
}
