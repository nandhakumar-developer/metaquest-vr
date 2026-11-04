import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GatewayContext } from '../context.js';
import type { AuthenticatedAdmin } from '../auth/sessions.js';
import { badRequest, forbidden } from '../utils/errors.js';

/** Authenticate via the gateway session cookie. Mutations also require CSRF. */
export function requireSession(
  ctx: GatewayContext,
  request: FastifyRequest,
  options: { operator?: boolean } = {},
): AuthenticatedAdmin {
  const authenticated = ctx.auth.sessions.requireRequest(request);
  if (options.operator) {
    if (authenticated.identity.role === 'viewer') {
      throw forbidden('Your role can view the dashboard but cannot modify devices');
    }
    ctx.auth.sessions.requireCsrf(request, authenticated);
  }
  return authenticated;
}

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value ?? {});
  if (!parsed.success) {
    throw badRequest('Request validation failed', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

export function parseQuery<T>(schema: z.ZodType<T>, value: unknown): T {
  return parseBody(schema, value);
}

export function paginationFromQuery(query: unknown): { page: number; pageSize: number } {
  const parsed = parseBody(zPagination, query);
  return { page: parsed.page, pageSize: parsed.pageSize };
}

const zPagination = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export function clientIp(request: FastifyRequest): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}

/**
 * Base URL the browser should use for the gateway.
 *
 * When the dashboard is opened on the PC itself (localhost / 127.0.0.1) we must
 * not hand out a localhost player link, because the headset cannot resolve it.
 * In that case the configured or auto-detected LAN URL is used. When the admin
 * is already browsing through a LAN hostname or address, mirror that host so
 * the generated link matches the interface the user is actually using.
 */
export function gatewayBaseUrlForRequest(
  request: FastifyRequest,
  ctx: GatewayContext,
): string {
  const rawHost = request.headers.host;
  if (rawHost) {
    try {
      const hostname = new URL(`http://${rawHost}`).hostname.replace(/^\[|\]$/g, '');
      if (hostname && !isLoopbackHostname(hostname)) {
        const protocol = request.protocol === 'https' ? 'https' : 'http';
        return `${protocol}://${rawHost}`.replace(/\/+$/, '');
      }
    } catch {
      // Fall back to the configured URL below.
    }
  }
  return ctx.urls.publicUrl.replace(/\/+$/, '');
}

export function playerUrlForRequest(request: FastifyRequest, ctx: GatewayContext): string {
  return `${gatewayBaseUrlForRequest(request, ctx)}/player/`;
}
