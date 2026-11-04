import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { ServerOptions as HttpsServerOptions } from 'node:https';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { ZodError } from 'zod';
import { loadConfig, type ConfigOverrides } from './config.js';
import { createContext, type GatewayContext } from './context.js';
import type { CloudAdapter } from './services/cloudAdapter.js';
import { AppError } from './utils/errors.js';
import { allowedOrigins, assertAllowedOrigin, isOriginAllowed } from './security/origin.js';
import { applySecurityHeaders } from './security/headers.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerVideoRoutes } from './routes/videos.js';
import { registerDownloadRoutes } from './routes/downloads.js';
import { registerSessionRoutes, registerSettingsRoutes } from './routes/sessions.js';
import { registerPlayerRoutes } from './routes/player.js';
import { registerPlaybackRoutes } from './routes/playback.js';

export interface BuildServerOptions {
  config?: ConfigOverrides;
  disableRateLimit?: boolean;
  cloudAdapter?: CloudAdapter | null;
}

export interface BuiltServer {
  app: FastifyInstance;
  ctx: GatewayContext;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<BuiltServer> {
  const config = loadConfig(options.config);
  let httpsOptions: HttpsServerOptions | undefined;
  if (config.tlsCertPath && config.tlsKeyPath) {
    httpsOptions = {
      key: readFileSync(config.tlsKeyPath),
      cert: readFileSync(config.tlsCertPath),
    };
  }
  const app = Fastify({
    ...(httpsOptions ? { https: httpsOptions } : {}),
    logger: config.quietLogs
      ? false
      : {
          level: config.logLevel,
        },
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    maxParamLength: 400,
    requestTimeout: 30_000,
  });

  const ctx = await createContext(config, app.log, {
    cloudAdapter: options.cloudAdapter,
  });
  let closed = false;

  await app.register(cookie);
  await app.register(cors, {
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || isOriginAllowed(origin, config)) callback(null, true);
      else callback(new Error('Origin is not allowed'), false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-vrcc-csrf', 'authorization'],
    exposedHeaders: ['content-range', 'accept-ranges', 'content-length'],
    maxAge: 600,
  });
  if (!options.disableRateLimit) {
    await app.register(rateLimit, {
      global: true,
      max: 600,
      timeWindow: '1 minute',
      keyGenerator: (request) => request.ip,
      errorResponseBuilder: (_request, context) => ({
        statusCode: 429,
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests. Retry in ${Math.ceil(Number(context.ttl) / 1000)} seconds.`,
        },
      }),
    });
  }
  await app.register(multipart, {
    limits: {
      fileSize: config.maxVideoUploadBytes,
      files: 1,
      fields: 10,
      parts: 15,
      headerPairs: 2000,
    },
    throwFileSizeLimit: true,
  });

  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0];
    if (
      request.method === 'GET' &&
      (pathname === '/' || pathname === '/index.html') &&
      isQuestBrowser(request.headers['user-agent'])
    ) {
      reply.header('Cache-Control', 'no-store');
      reply.header('Vary', 'User-Agent');
      return reply.redirect('/player/');
    }
    if (request.url.startsWith('/api/')) {
      assertAllowedOrigin(request, config);
    }
    return undefined;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const contentType = reply.getHeader('content-type');
    applySecurityHeaders(
      reply,
      config,
      typeof contentType === 'string' ? contentType : undefined,
    );
    if (request.url.startsWith('/api/')) {
      reply.header('Cache-Control', 'no-store');
    }
    return payload;
  });

  await registerSystemRoutes(app, ctx);
  await registerAuthRoutes(app, ctx);
  await registerDeviceRoutes(app, ctx);
  await registerVideoRoutes(app, ctx);
  await registerDownloadRoutes(app, ctx);
  await registerSessionRoutes(app, ctx);
  await registerSettingsRoutes(app, ctx);
  await registerPlayerRoutes(app, ctx);
  await registerPlaybackRoutes(app, ctx);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error, code: error.code }, 'Application error');
      }
      return reply.code(error.statusCode).send(error.toBody());
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.issues,
        },
      });
    }
    const err = error as {
      validation?: unknown;
      statusCode?: number;
      code?: string;
      message?: string;
    };
    if (err.validation) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message ?? 'Validation failed',
          details: err.validation,
        },
      });
    }
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    const errorCode = err.code;
    if (statusCode === 429) {
      return reply.code(429).send({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again shortly.' },
      });
    }
    if (errorCode === 'FST_REQ_FILE_TOO_LARGE' || errorCode === 'FST_FILES_LIMIT') {
      return reply.code(413).send({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `Upload exceeds the ${config.maxVideoUploadBytes} byte limit`,
        },
      });
    }
    if (errorCode?.startsWith('FST_ERR_CTP')) {
      return reply.code(statusCode >= 400 ? statusCode : 400).send({
        error: { code: 'INVALID_REQUEST_BODY', message: err.message ?? 'Invalid body' },
      });
    }
    if (statusCode < 500) {
      return reply.code(statusCode).send({
        error: { code: 'REQUEST_FAILED', message: err.message ?? 'Request failed' },
      });
    }
    request.log.error({ err: error }, 'Unhandled request error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'The gateway encountered an unexpected error',
      },
    });
  });

  if (config.adminDistDir) {
    await app.register(fastifyStatic, {
      root: config.adminDistDir,
      prefix: '/',
      decorateReply: true,
      index: ['index.html'],
      setHeaders: (reply: any, filePath: string) => {
        const val = filePath.endsWith('index.html')
          ? 'no-cache'
          : 'public, max-age=31536000, immutable';
        if (typeof reply.header === 'function') {
          reply.header('Cache-Control', val);
        } else if (typeof reply.setHeader === 'function') {
          reply.setHeader('Cache-Control', val);
        }
      },
    });
  }

  // Browser player for Meta Quest. Always served locally; works in dev and in
  // production builds. The player uses the same origin for REST + WebSocket.
  const playerDir = path.join(config.repoRoot, 'apps', 'player');
  if (existsSync(path.join(playerDir, 'index.html'))) {
    const require = createRequire(import.meta.url);
    let threeBuildDir: string | null = null;
    try {
      // `three/package.json` is not exposed through the package `exports` map,
      // so resolve the main entry instead and use its containing build folder.
      const threeEntry = require.resolve('three');
      const candidate = path.dirname(threeEntry);
      if (existsSync(path.join(candidate, 'three.module.js'))) threeBuildDir = candidate;
    } catch {
      // three is optional; the player falls back to non-WebXR playback.
    }
    if (threeBuildDir) {
      // three.module.js imports ./three.core.js, so serve the whole build
      // directory rather than a single file.
      await app.register(fastifyStatic, {
        root: threeBuildDir,
        prefix: '/player/vendor/',
        decorateReply: false,
        setHeaders: (reply: any) => {
          const val = 'public, max-age=604800, immutable';
          if (typeof reply.header === 'function') reply.header('Cache-Control', val);
        },
      });
    }
    await app.register(fastifyStatic, {
      root: playerDir,
      prefix: '/player/',
      decorateReply: false,
      index: ['index.html'],
      setHeaders: (reply: any, filePath: string) => {
        // Player code is plain ES modules with no build step, so it changes in
        // place. Always revalidate (ETag/304) to avoid serving stale modules
        // after an update; `max-age` previously kept broken code alive in the
        // Quest Browser cache for minutes after a fix.
        const val = filePath.endsWith('.html') ? 'no-cache' : 'no-cache, must-revalidate';
        if (typeof reply.header === 'function') reply.header('Cache-Control', val);
      },
    });
    app.get('/player', async (_request, reply) => reply.redirect('/player/'));
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/ws')) {
      return reply.code(404).send({
        error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
      });
    }
    const acceptsHtml =
      typeof request.headers.accept === 'string' && request.headers.accept.includes('text/html');
    if (config.adminDistDir && request.method === 'GET' && acceptsHtml) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  ctx.wsServer.attach(app.server);
  ctx.cloud.start();
  ctx.offlineMonitor.start();
  ctx.maintenance.start();

  app.addHook('onClose', async () => {
    if (closed) return;
    closed = true;
    ctx.close();
  });

  app.log.info(
    {
      origin: [...allowedOrigins(config)],
      publicUrl: ctx.urls.publicUrl,
      playerUrl: config.playerUrl,
      lanAddresses: ctx.urls.lanAddresses,
      urlWarnings: ctx.urls.warnings,
      supabaseConfigured: config.supabase.configured,
      ffmpeg: ctx.media.available,
      adminDist: config.adminDistDir,
    },
    'VR Control Center gateway initialized',
  );

  return { app, ctx };
}

export async function listen(app: FastifyInstance, host: string, port: number): Promise<string> {
  return app.listen({ host, port });
}

/**
 * Headsets should land on the player, never the administrator dashboard.
 * Meta Quest Browser identifies itself through the OculusBrowser token.
 */
export function isQuestBrowser(userAgent: string | string[] | undefined): boolean {
  const value = Array.isArray(userAgent) ? userAgent.join(' ') : (userAgent ?? '');
  return /OculusBrowser|Meta Quest|Quest [23]|Quest Pro/i.test(value);
}
