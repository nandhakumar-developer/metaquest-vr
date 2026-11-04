import { createPrivateKey, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { DEFAULT_PREVIEW_MAX_FPS } from '@vrcc/protocol';

export interface SupabaseConfig {
  url: string | null;
  anonKey: string | null;
  serviceRoleKey: string | null;
  bucket: string;
  configured: boolean;
  syncEnabled: boolean;
  syncIntervalMs: number;
}

export interface GatewayConfig {
  env: 'development' | 'test' | 'production';
  host: string;
  port: number;
  adminOrigin: string;
  extraAllowedOrigins: string[];
  publicGatewayUrl: string | null;
  playerUrl: string;
  tlsCertPath: string | null;
  tlsKeyPath: string | null;
  trustProxy: boolean;
  repoRoot: string;
  dataDir: string;
  videoDir: string;
  thumbnailDir: string;
  tempDir: string;
  logDir: string;
  logLevel: string;
  heartbeatIntervalMs: number;
  offlineThresholdMs: number;
  commandTimeoutMs: number;
  pairingTtlSeconds: number;
  pairingMaxAttempts: number;
  adminSessionTtlHours: number;
  retentionDays: number;
  previewMaxFps: number;
  previewMaxJpegBytes: number;
  maxVideoUploadBytes: number;
  maxConcurrentDownloadsPerDevice: number;
  ffprobePath: string;
  ffmpegPath: string;
  ffprobeTimeoutMs: number;
  supabase: SupabaseConfig;
  adminDistDir: string | null;
  quietLogs: boolean;
}

const numberFromEnv = (fallback: number, min: number, max: number) =>
  z
    .preprocess(
      (value) => (value === undefined || value === '' ? undefined : Number(value)),
      z.number().int().min(min).max(max),
    )
    .default(fallback);

const previewFpsFromEnv = () =>
  z
    .preprocess(
      (value) => {
        if (value === undefined || value === '') return undefined;
        const parsed = Number(value);
        // PREVIEW_MAX_FPS=1 was the old sample default, not a useful target.
        return parsed === 1 ? DEFAULT_PREVIEW_MAX_FPS : parsed;
      },
      z.number().int().min(5).max(15),
    )
    .default(DEFAULT_PREVIEW_MAX_FPS);

const boolFromEnv = (fallback: boolean) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      if (typeof value === 'boolean') return value;
      return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
    }, z.boolean())
    .default(fallback);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GATEWAY_HOST: z.string().min(1).default('0.0.0.0'),
  GATEWAY_PORT: numberFromEnv(4000, 0, 65_535),
  ADMIN_ORIGIN: z.string().url().default('http://localhost:3000'),
  EXTRA_ALLOWED_ORIGINS: z.string().default(''),
  PUBLIC_GATEWAY_URL: z.string().default(''),
  TLS_CERT_PATH: z.string().default(''),
  TLS_KEY_PATH: z.string().default(''),
  TRUST_PROXY: boolFromEnv(false),
  DATA_DIR: z.string().default('./storage/data'),
  VIDEO_DIR: z.string().default('./storage/videos'),
  THUMBNAIL_DIR: z.string().default('./storage/thumbnails'),
  TEMP_DIR: z.string().default('./storage/temp'),
  LOG_DIR: z.string().default('./storage/logs'),
  LOG_LEVEL: z.string().default('info'),
  HEARTBEAT_INTERVAL_MS: numberFromEnv(5_000, 1_000, 60_000),
  OFFLINE_THRESHOLD_MS: numberFromEnv(18_000, 3_000, 300_000),
  COMMAND_TIMEOUT_MS: numberFromEnv(6_000, 1_000, 120_000),
  PAIRING_TTL_SECONDS: numberFromEnv(180, 30, 3_600),
  PAIRING_MAX_ATTEMPTS: numberFromEnv(5, 1, 50),
  ADMIN_SESSION_TTL_HOURS: numberFromEnv(12, 1, 24 * 30),
  RETENTION_DAYS: numberFromEnv(30, 1, 3_650),
  PREVIEW_MAX_FPS: previewFpsFromEnv(),
  PREVIEW_MAX_JPEG_BYTES: numberFromEnv(250_000, 10_000, 2_000_000),
  MAX_VIDEO_UPLOAD_BYTES: numberFromEnv(21_474_836_480, 1_048_576, 200_000_000_000),
  MAX_CONCURRENT_DOWNLOADS_PER_DEVICE: numberFromEnv(1, 1, 4),
  FFPROBE_PATH: z.string().default('ffprobe'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_TIMEOUT_MS: numberFromEnv(20_000, 1_000, 120_000),
  VITE_SUPABASE_URL: z.string().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().default(''),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().default(''),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_VIDEO_BUCKET: z.string().default('vr-videos'),
  CLOUD_SYNC_ENABLED: boolFromEnv(true),
  CLOUD_SYNC_INTERVAL_MS: numberFromEnv(30_000, 5_000, 600_000),
});

export function findRepoRoot(start: string = process.cwd()): string {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(current, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as { workspaces?: unknown };
        if (Array.isArray(pkg.workspaces)) return current;
      } catch {
        // Keep walking.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

function loadEnvironmentFiles(repoRoot: string): void {
  const candidates = [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(process.cwd(), '.env'),
  ];
  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    // Existing process variables win; do not let .env override explicit config.
    loadDotenv({ path: candidate, override: false, quiet: true });
  }
}

function resolvePath(repoRoot: string, value: string): string {
  if (path.isAbsolute(value)) return value;
  return path.resolve(repoRoot, value);
}

export function normalizeOrigin(value: string): string {
  try {
    return new URL(value).origin.toLowerCase();
  } catch {
    return value.trim().replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * HTTPS is required for immersive WebXR from a headset. `npm run https:setup`
 * writes a local certificate here; when it is valid we enable TLS
 * automatically so a plain `npm start` picks it up without editing `.env`.
 */
function resolveGeneratedTls(repoRoot: string): { cert: string; key: string } | null {
  const certPath = path.join(repoRoot, 'certs', 'gateway.crt');
  const keyPath = path.join(repoRoot, 'certs', 'gateway.key');
  if (!existsSync(certPath) || !existsSync(keyPath)) return null;
  try {
    const cert = new X509Certificate(readFileSync(certPath, 'utf8'));
    const key = createPrivateKey(readFileSync(keyPath, 'utf8'));
    if (!cert.checkPrivateKey(key)) {
      process.stderr.write(
        '[VRCC] Ignoring certs/gateway.*: the certificate and private key do not match.\n',
      );
      return null;
    }
    if (new Date(cert.validTo).getTime() <= Date.now()) {
      process.stderr.write(
        '[VRCC] Ignoring expired certs/gateway.crt. Run `npm run https:setup` to refresh it.\n',
      );
      return null;
    }
    return { cert: certPath, key: keyPath };
  } catch (error) {
    process.stderr.write(
      `[VRCC] Ignoring certs/gateway.*: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return null;
  }
}

export interface ConfigOverrides {
  host?: string;
  port?: number;
  env?: GatewayConfig['env'];
  dataDir?: string;
  videoDir?: string;
  thumbnailDir?: string;
  tempDir?: string;
  logDir?: string;
  adminOrigin?: string;
  publicGatewayUrl?: string | null;
  tlsCertPath?: string | null;
  tlsKeyPath?: string | null;
  adminDistDir?: string | null;
  quietLogs?: boolean;
  commandTimeoutMs?: number;
  offlineThresholdMs?: number;
  heartbeatIntervalMs?: number;
  pairingTtlSeconds?: number;
  supabase?: Partial<SupabaseConfig>;
}

export function loadConfig(overrides: ConfigOverrides = {}): GatewayConfig {
  const repoRoot = findRepoRoot();
  loadEnvironmentFiles(repoRoot);
  const parsed = envSchema.parse(process.env);

  const supabaseUrl = parsed.SUPABASE_URL || parsed.VITE_SUPABASE_URL || null;
  const supabaseAnonKey =
    parsed.SUPABASE_ANON_KEY ||
    parsed.VITE_SUPABASE_ANON_KEY ||
    parsed.VITE_SUPABASE_PUBLISHABLE_KEY ||
    null;
  const supabaseServiceRoleKey = parsed.SUPABASE_SERVICE_ROLE_KEY || null;

  const supabase: SupabaseConfig = {
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    serviceRoleKey: supabaseServiceRoleKey,
    bucket: parsed.SUPABASE_VIDEO_BUCKET,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
    syncEnabled: parsed.CLOUD_SYNC_ENABLED,
    syncIntervalMs: parsed.CLOUD_SYNC_INTERVAL_MS,
    ...overrides.supabase,
  };
  supabase.configured = Boolean(supabase.url && supabase.anonKey);

  const tlsConfiguredExplicitly =
    overrides.tlsCertPath !== undefined ||
    overrides.tlsKeyPath !== undefined ||
    Boolean(parsed.TLS_CERT_PATH) ||
    Boolean(parsed.TLS_KEY_PATH);
  const generatedTls = tlsConfiguredExplicitly ? null : resolveGeneratedTls(repoRoot);
  const tlsCertPath = tlsConfiguredExplicitly
    ? overrides.tlsCertPath !== undefined
      ? overrides.tlsCertPath
      : parsed.TLS_CERT_PATH
        ? resolvePath(repoRoot, parsed.TLS_CERT_PATH)
        : null
    : (generatedTls?.cert ?? null);
  const tlsKeyPath = tlsConfiguredExplicitly
    ? overrides.tlsKeyPath !== undefined
      ? overrides.tlsKeyPath
      : parsed.TLS_KEY_PATH
        ? resolvePath(repoRoot, parsed.TLS_KEY_PATH)
        : null
    : (generatedTls?.key ?? null);

  const config: GatewayConfig = {
    env: overrides.env ?? parsed.NODE_ENV,
    host: overrides.host ?? parsed.GATEWAY_HOST,
    port: overrides.port ?? parsed.GATEWAY_PORT,
    adminOrigin: overrides.adminOrigin ?? parsed.ADMIN_ORIGIN,
    extraAllowedOrigins: parsed.EXTRA_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    publicGatewayUrl: (overrides.publicGatewayUrl ?? parsed.PUBLIC_GATEWAY_URL) || null,
    playerUrl: '',
    tlsCertPath,
    tlsKeyPath,
    trustProxy: parsed.TRUST_PROXY,
    repoRoot,
    dataDir: resolvePath(repoRoot, overrides.dataDir ?? parsed.DATA_DIR),
    videoDir: resolvePath(repoRoot, overrides.videoDir ?? parsed.VIDEO_DIR),
    thumbnailDir: resolvePath(repoRoot, overrides.thumbnailDir ?? parsed.THUMBNAIL_DIR),
    tempDir: resolvePath(repoRoot, overrides.tempDir ?? parsed.TEMP_DIR),
    logDir: resolvePath(repoRoot, overrides.logDir ?? parsed.LOG_DIR),
    logLevel: parsed.LOG_LEVEL,
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? parsed.HEARTBEAT_INTERVAL_MS,
    offlineThresholdMs: overrides.offlineThresholdMs ?? parsed.OFFLINE_THRESHOLD_MS,
    commandTimeoutMs: overrides.commandTimeoutMs ?? parsed.COMMAND_TIMEOUT_MS,
    pairingTtlSeconds: overrides.pairingTtlSeconds ?? parsed.PAIRING_TTL_SECONDS,
    pairingMaxAttempts: parsed.PAIRING_MAX_ATTEMPTS,
    adminSessionTtlHours: parsed.ADMIN_SESSION_TTL_HOURS,
    retentionDays: parsed.RETENTION_DAYS,
    previewMaxFps: parsed.PREVIEW_MAX_FPS,
    previewMaxJpegBytes: parsed.PREVIEW_MAX_JPEG_BYTES,
    maxVideoUploadBytes: parsed.MAX_VIDEO_UPLOAD_BYTES,
    maxConcurrentDownloadsPerDevice: parsed.MAX_CONCURRENT_DOWNLOADS_PER_DEVICE,
    ffprobePath: parsed.FFPROBE_PATH,
    ffmpegPath: parsed.FFMPEG_PATH,
    ffprobeTimeoutMs: parsed.FFPROBE_TIMEOUT_MS,
    supabase,
    adminDistDir: overrides.adminDistDir ?? null,
    quietLogs: overrides.quietLogs ?? false,
  };

  config.adminDistDir =
    overrides.adminDistDir === null
      ? null
      : overrides.adminDistDir ??
        (existsSync(path.join(repoRoot, 'apps', 'admin', 'dist', 'index.html'))
          ? path.join(repoRoot, 'apps', 'admin', 'dist')
          : null);

  config.playerUrl = `${resolveGatewayUrls(config).publicUrl.replace(/\/+$/, '')}/player/`;

  return config;
}

export function ensureDirectories(config: GatewayConfig): void {
  for (const dir of [
    config.dataDir,
    config.videoDir,
    config.thumbnailDir,
    config.tempDir,
    config.logDir,
  ]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
}

export interface LanAddress {
  address: string;
  interfaceName: string;
  family: 'IPv4';
}

export function listLanAddresses(): LanAddress[] {
  const results: LanAddress[] = [];
  const interfaces = networkInterfaces();
  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue;
      if (address.address.startsWith('169.254.')) continue;
      results.push({ address: address.address, interfaceName, family: 'IPv4' });
    }
  }
  return results;
}

/** Names used by virtual adapters that are never reachable from a headset. */
const VIRTUAL_INTERFACE_PATTERN =
  /(vethernet|hyper-?v|virtualbox|vmware|virtual|docker|wsl|loopback|tailscale|zerotier|nordlynx|wireguard|bluetooth|npcap|^tap\b|^tun\b)/i;

function isPrivateIpv4(address: string): boolean {
  return (
    address.startsWith('10.') ||
    address.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address)
  );
}

/**
 * Scores a LAN address so the primary physical adapter (Wi-Fi/Ethernet) wins
 * over VirtualBox, Hyper-V, WSL, Docker, VPN, and other virtual adapters.
 * `listLanAddresses()` order comes from the OS and is not meaningful here.
 */
export function lanAddressScore(entry: LanAddress): number {
  let score = 0;
  if (VIRTUAL_INTERFACE_PATTERN.test(entry.interfaceName)) score -= 1_000;
  // VirtualBox host-only networks and Docker/WSL bridge ranges are not routable
  // from a Quest on the real LAN, even when the adapter name looks physical.
  if (/^192\.168\.56\./.test(entry.address)) score -= 500;
  if (/^172\.(1[7-9]|2\d|3[01])\./.test(entry.address)) score -= 100;
  if (/(^|\b)(wi-?fi|wlan|wireless)/i.test(entry.interfaceName)) score += 100;
  else if (/(^|\b)(ethernet|eth\d|en\d)/i.test(entry.interfaceName)) score += 80;
  if (isPrivateIpv4(entry.address)) score += 20;
  return score;
}

export function listRankedLanAddresses(): LanAddress[] {
  return [...listLanAddresses()].sort((a, b) => lanAddressScore(b) - lanAddressScore(a));
}

export function resolveGatewayUrls(config: GatewayConfig): {
  publicUrl: string;
  wsUrl: string;
  lanAddresses: string[];
  secure: boolean;
} {
  const secure = Boolean(config.tlsCertPath && config.tlsKeyPath);
  const protocol = secure ? 'https' : 'http';
  const wsProtocol = secure ? 'wss' : 'ws';
  const lanAddresses = listRankedLanAddresses().map((entry) => entry.address);
  const publicUrl =
    config.publicGatewayUrl?.replace(/\/+$/, '') ??
    `${protocol}://${lanAddresses[0] ?? 'localhost'}:${config.port}`;
  const wsUrl = `${wsProtocol}://${new URL(publicUrl).host}/ws`;
  return { publicUrl, wsUrl, lanAddresses, secure };
}

/**
 * Checks whether a TLS certificate lists `host` in its subject alternative
 * names. A LAN address that changed after the certificate was generated causes
 * a name-mismatch warning on the headset, so startup reports it explicitly.
 */
export function tlsCertificateCoversHost(certPath: string, host: string): boolean {
  try {
    const certificate = new X509Certificate(readFileSync(certPath));
    const normalizedHost = host.toLowerCase().replace(/^\[|\]$/g, '');
    for (const entry of (certificate.subjectAltName ?? '').split(',')) {
      const value = entry.trim();
      if (value.toLowerCase().startsWith('dns:')) {
        if (value.slice(4).trim().toLowerCase() === normalizedHost) return true;
      } else if (value.toLowerCase().startsWith('ip address:')) {
        if (value.slice(11).trim().toLowerCase() === normalizedHost) return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

export function defaultAdminEmail(): string {
  return process.env.BOOTSTRAP_ADMIN_EMAIL || `admin@${homedir().split(path.sep).pop() ?? 'local'}.local`;
}
