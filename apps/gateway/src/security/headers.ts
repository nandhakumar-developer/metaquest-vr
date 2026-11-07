import type { FastifyReply } from 'fastify';
import type { GatewayConfig } from '../config.js';

const BASE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' ws: wss:",
  "object-src 'none'",
].join('; ');

/**
 * Applies defensive response headers. CSP is applied to HTML responses only so
 * JSON API clients are unaffected. The dashboard, player, and gateway all share
 * one local origin, so connect-src never needs to allow a remote service.
 */
export function applySecurityHeaders(
  reply: FastifyReply,
  config: GatewayConfig,
  contentType: string | undefined,
): void {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), xr-spatial-tracking=(self)',
  );
  reply.header('Cross-Origin-Resource-Policy', 'same-origin');
  if (config.tlsCertPath && config.tlsKeyPath) {
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  if (contentType?.includes('text/html')) {
    reply.header('Content-Security-Policy', BASE_CSP);
  }
}
