import type { FastifyInstance } from 'fastify';
import type { GatewayConfigResponse, GatewayInfo, HealthResponse } from '@vrcc/shared-types';
import { PROTOCOL_VERSION } from '@vrcc/protocol';
import type { GatewayContext } from '../context.js';
import { APP_VERSION } from '../version.js';
import { playerUrlForRequest, requireSession } from './helpers.js';

export function gatewayInfo(ctx: GatewayContext): GatewayInfo {
  return {
    version: APP_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    host: ctx.config.host,
    port: ctx.config.port,
    publicUrl: ctx.urls.publicUrl,
    lanAddresses: ctx.urls.lanAddresses,
    wsUrl: ctx.urls.wsUrl,
    secure: ctx.urls.secure,
    serverTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  ctx: GatewayContext,
): Promise<void> {
  app.get('/api/health', async (_request, reply) => {
    let database: 'ok' | 'error' = 'ok';
    try {
      ctx.store.db.prepare('SELECT 1 AS ok').get();
    } catch {
      database = 'error';
    }
    const devices = ctx.store.devices.listDevices();
    const online = ctx.state.listDevices().filter((device) => device.online).length;
    const health: HealthResponse = {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: APP_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      database,
      cloud: ctx.cloud.status(),
      devices: { online, total: devices.length },
      ffmpeg: { available: ctx.media.available, path: ctx.media.available ? ctx.config.ffprobePath : null },
    };
    return reply.code(database === 'ok' ? 200 : 503).send(health);
  });

<<<<<<< HEAD
  app.get('/api/config', async (request): Promise<GatewayConfigResponse> => {
=======
  app.get('/api/config', async (): Promise<GatewayConfigResponse> => {
    const hasSupabase =
      ctx.config.supabase.configured &&
      Boolean(ctx.config.supabase.url) &&
      Boolean(ctx.config.supabase.anonKey);
>>>>>>> origin/main
    const needsBootstrap = ctx.bootstrap.status().needsBootstrap;
    return {
      auth: {
        local: !hasSupabase,
        needsBootstrap,
<<<<<<< HEAD
=======
        supabase:
          hasSupabase && ctx.auth.supabase.roleVerificationAvailable
            ? {
                url: ctx.config.supabase.url!,
                anonKey: ctx.config.supabase.anonKey!,
                roleVerification: true,
              }
            : null,
>>>>>>> origin/main
      },
      gateway: gatewayInfo(ctx),
      playerUrl: playerUrlForRequest(request, ctx),
      settings: ctx.store.ops.getSettings(),
      features: {
        previewSnapshot: true,
        previewWebrtc: false,
        cloudStorage: false,
        ffmpeg: ctx.media.available,
        browserPlayer: true,
        webxrRequiresSecureContext: !ctx.urls.secure,
      },
    };
  });

  app.get('/api/gateway', async (request) => {
    requireSession(ctx, request);
    return {
      ...gatewayInfo(ctx),
      auth: {
        cloudSyncEnabled: ctx.cloud.enabled,
      },
      ffmpeg: { available: ctx.media.available, version: ctx.media.version },
      paths: {
        dataDir: ctx.config.dataDir,
        videoDir: ctx.config.videoDir,
      },
      limits: {
        maxVideoUploadBytes: ctx.config.maxVideoUploadBytes,
        heartbeatIntervalMs: ctx.config.heartbeatIntervalMs,
        offlineThresholdMs: ctx.config.offlineThresholdMs,
        commandTimeoutMs: ctx.config.commandTimeoutMs,
      },
    };
  });

  app.post('/api/cloud/check', async (request) => {
    requireSession(ctx, request, { operator: true });
    const online = await ctx.cloud.checkNow();
    return { online, cloud: ctx.cloud.status() };
  });
}
