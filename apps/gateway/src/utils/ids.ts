import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

export function newId(): string {
  return randomUUID();
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function randomSecretHex(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Cryptographically secure numeric pairing code (avoids leading-zero surprises). */
export function randomPairingCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function safeEqualHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function safeEqualString(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

const FILENAME_ALLOWED = /[^a-zA-Z0-9._ -]/g;

/** Keep a human-readable filename but strip separators and traversal sequences. */
export function sanitizeFilename(input: string, fallback = 'video.mp4'): string {
  const base = path.basename(input.replaceAll('\\', '/'));
  const cleaned = base
    .normalize('NFKD')
    .replace(FILENAME_ALLOWED, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

/** Resolve `child` inside `parent`, rejecting traversal. */
export function resolveInside(parent: string, ...children: string[]): string {
  const root = path.resolve(parent);
  const target = path.resolve(root, ...children);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes the permitted directory');
  }
  return target;
}

export function shortId(value: string, length = 8): string {
  return value.replaceAll('-', '').slice(0, length);
}
