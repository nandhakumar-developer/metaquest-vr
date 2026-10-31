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
 * JSON API clients are unaffected. Supabase browser calls use connect-src from
 * the configured project; operators who enable Supabase should extend CSP via
 * a reverse proxy if they also use a separate Supabase origin.
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
    const connectSources = ["'self'", 'ws:', 'wss:'];
    if (config.supabase.url) {
      try {
        connectSources.push(new URL(config.supabase.url).origin);
      } catch {
        // Ignore malformed Supabase URL.
      }
    }
    const csp = BASE_CSP.replace(
      "connect-src 'self' ws: wss:",
      `connect-src ${connectSources.join(' ')}`,
    );
    reply.header('Content-Security-Policy', csp);
  }
}
