import type { FastifyRequest } from 'fastify';
import { normalizeOrigin, resolveGatewayUrls, type GatewayConfig } from '../config.js';
import { forbidden } from '../utils/errors.js';

export function allowedOrigins(config: GatewayConfig): Set<string> {
  const origins = new Set<string>();
  origins.add(normalizeOrigin(config.adminOrigin));
  for (const extra of config.extraAllowedOrigins) origins.add(normalizeOrigin(extra));
  try {
    origins.add(normalizeOrigin(resolveGatewayUrls(config).publicUrl));
  } catch {
    // Ignore malformed public URL.
  }
  origins.add(`http://localhost:${config.port}`);
  origins.add(`http://127.0.0.1:${config.port}`);
  origins.add('https://localhost:3000');
  origins.add('http://localhost:3000');
  origins.add('http://127.0.0.1:3000');
  return origins;
}

export function isOriginAllowed(
  origin: string | undefined,
  config: GatewayConfig,
  hostHeader?: string,
): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowedOrigins(config).has(normalized)) return true;
  if (hostHeader) {
    try {
      const requestOrigin = new URL(`${origin.startsWith('https') ? 'https' : 'http'}://${hostHeader}`)
        .origin;
      if (normalized === requestOrigin.toLowerCase()) return true;
    } catch {
      // Ignore malformed host headers.
    }
  }
  return false;
}

/** Blocks cross-site browser calls. Non-browser clients legitimately omit Origin. */
export function assertAllowedOrigin(request: FastifyRequest, config: GatewayConfig): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const host = request.headers.host;
  if (!isOriginAllowed(origin, config, host)) {
    throw forbidden('Origin is not allowed by the gateway');
  }
}

export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace(/^::ffff:/, '');
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost' ||
    normalized.startsWith('127.')
  );
}
