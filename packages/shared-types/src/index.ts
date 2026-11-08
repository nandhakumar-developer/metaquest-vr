/**
 * Domain types shared by the admin UI, gateway and documented for Quest.
 * These are deliberately transport-agnostic; wire schemas live in @vrcc/protocol.
 */

export const PROJECTION_TYPES = ['flat', '180', '360'] as const;
export type ProjectionType = (typeof PROJECTION_TYPES)[number];

export const STEREO_LAYOUTS = ['mono', 'sbs', 'ou'] as const;
export type StereoLayout = (typeof STEREO_LAYOUTS)[number];

export const DEVICE_STATUSES = ['online', 'offline', 'revoked'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const PLAYBACK_STATES = [
  'idle',
  'loading',
  'buffering',
  'ready',
  'playing',
  'paused',
  'ended',
  'error',
] as const;
export type PlaybackState = (typeof PLAYBACK_STATES)[number];

export const COMMAND_TYPES = [
  'PLAY',
  'PAUSE',
  'STOP',
  'SEEK',
  'LOAD_VIDEO',
  'SET_VOLUME',
  'GET_STATUS',
  'REQUEST_PREVIEW',
  'STOP_PREVIEW',
  'RELOAD_PLAYER',
  'ENTER_IMMERSIVE',
  'EXIT_IMMERSIVE',
  'EXIT_FULLSCREEN',
  'PING',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

export type CommandRequestStatus = 'pending' | 'acknowledged' | 'failed' | 'timeout';

export type DownloadStatus =
  | 'pending'
  | 'queued'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'failed'
  | 'cancelled';

export type SessionFinalStatus = 'completed' | 'stopped' | 'error' | 'interrupted';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Quaternion {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface DeviceCapabilities {
  /** Device can render an equirectangular sphere projection. */
  projection360: boolean;
  /** Device can render a 180-degree hemisphere projection. */
  projection180: boolean;
  /** Device can decode side-by-side / over-under packed stereo. */
  stereoscopic: boolean;
  /** Device can emit low-rate JPEG headset snapshots. */
  snapshotPreview: boolean;
  /** Device can emit WebRTC headset view (not implemented in initial release). */
  webrtcPreview: boolean;
  /** Device reports head orientation. */
  headPose: boolean;
  /** Device supports HTTP range resume. */
  resumableDownloads: boolean;
}

export const DEFAULT_CAPABILITIES: DeviceCapabilities = {
  projection360: true,
  projection180: true,
  stereoscopic: true,
  snapshotPreview: true,
  webrtcPreview: false,
  headPose: true,
  resumableDownloads: true,
};

export interface PlaybackSnapshot {
  state: PlaybackState;
  videoId: string | null;
  videoName: string | null;
  positionSeconds: number;
  durationSeconds: number | null;
  volume: number;
  /** True when the position is a confirmed Quest report (not a UI extrapolation). */
  positionConfirmed: boolean;
  error: string | null;
  updatedAt: string;
}

export const EMPTY_PLAYBACK: PlaybackSnapshot = {
  state: 'idle',
  videoId: null,
  videoName: null,
  positionSeconds: 0,
  durationSeconds: null,
  volume: 1,
  positionConfirmed: true,
  error: null,
  updatedAt: new Date(0).toISOString(),
};

export interface DeviceStorageInfo {
  freeBytes: number | null;
  totalBytes: number | null;
}

export interface DeviceSnapshot {
  id: string;
  deviceUuid: string;
  name: string;
  model: string;
  status: DeviceStatus;
  online: boolean;
  ipAddress: string | null;
  appVersion: string | null;
  batteryLevel: number | null;
  charging: boolean | null;
  lastSeenAt: string | null;
  pairedAt: string | null;
  createdAt: string;
  updatedAt: string;
  playback: PlaybackSnapshot;
  capabilities: DeviceCapabilities;
  storage: DeviceStorageInfo;
  previewActive: boolean;
  lastConnectionError: string | null;
  /** Number of videos the device can see (local inventory or shared browser library). */
  videoCount: number;
}

export interface VideoDto {
  id: string;
  name: string;
  originalFilename: string;
  storagePath: string;
  storageBackend: 'local';
  sizeBytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  projectionType: ProjectionType;
  stereoLayout: StereoLayout;
  checksum: string;
  thumbnailPath: string | null;
  compatibility: 'verified' | 'unverified' | 'unsupported';
  compatibilityNotes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Per-device rollup for the current deployment state. */
  deployments?: DeploymentSummary[];
}

export interface DeploymentSummary {
  deviceId: string;
  status: DownloadStatus;
  progress: number;
  checksumVerified: boolean;
  updatedAt: string;
}

export interface DeploymentDto {
  id: string;
  videoId: string;
  videoName: string;
  deviceId: string;
  deviceName: string;
  status: DownloadStatus;
  progress: number;
  bytesReceived: number;
  totalBytes: number;
  checksumVerified: boolean;
  error: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeviceVideoInventoryItem {
  videoId: string;
  name: string;
  sizeBytes: number | null;
  checksum: string | null;
  durationSeconds: number | null;
  downloadStatus: DownloadStatus;
  checksumVerified: boolean;
  localFilename: string | null;
  updatedAt: string;
}

export interface PairingRequestDto {
  id: string;
  code: string;
  deviceModel: string;
  appVersion: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  expiresInSeconds: number;
  status: 'pending' | 'paired' | 'expired' | 'cancelled';
}

export interface CommandDto {
  id: string;
  deviceId: string;
  deviceName: string;
  type: CommandType;
  payload: Record<string, unknown>;
  status: CommandRequestStatus;
  requestedBy: string;
  requestedAt: string;
  acknowledgedAt: string | null;
  errorMessage: string | null;
}

export interface PlaybackSessionDto {
  id: string;
  deviceId: string;
  deviceName: string;
  videoId: string | null;
  videoName: string | null;
  startedAt: string;
  endedAt: string | null;
  lastPositionSeconds: number;
  finalStatus: SessionFinalStatus | null;
  durationSeconds: number | null;
}

export interface DeviceLogDto {
  id: string;
  deviceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AdminIdentity {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'operator' | 'viewer';
  authSource: 'local';
  sessionExpiresAt: string;
}

export interface AppSettings {
  staleAfterSeconds: number;
  seekStepSeconds: number;
  previewMaxFps: number;
  defaultVolume: number;
  confirmDestructiveActions: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  staleAfterSeconds: 15,
  seekStepSeconds: 1,
  previewMaxFps: 30,
  defaultVolume: 0.8,
  confirmDestructiveActions: true,
};

export interface CloudStatus {
  configured: boolean;
  online: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingChanges: number;
  storageBackend: 'local';
}

export interface GatewayInfo {
  version: string;
  protocolVersion: number;
  host: string;
  port: number;
  publicUrl: string;
  lanAddresses: string[];
  wsUrl: string;
  secure: boolean;
  serverTime: string;
  uptimeSeconds: number;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  protocolVersion: number;
  uptimeSeconds: number;
  database: 'ok' | 'error';
  cloud: CloudStatus;
  devices: { online: number; total: number };
  ffmpeg: { available: boolean; path: string | null };
}

export interface GatewayConfigResponse {
  auth: {
    local: boolean;
    needsBootstrap: boolean;
<<<<<<< HEAD
=======
    /** Browser-safe values for Supabase Auth and RLS-protected profile lookup. */
    supabase: { url: string; anonKey: string; roleVerification: boolean } | null;
>>>>>>> origin/main
  };
  gateway: GatewayInfo;
  playerUrl: string;
  settings: AppSettings;
  features: {
    previewSnapshot: boolean;
    previewWebrtc: boolean;
    cloudStorage: boolean;
    ffmpeg: boolean;
    browserPlayer: boolean;
    webxrRequiresSecureContext: boolean;
  };
}

/* -------------------------------------------------------------------------- */
/* Group / scheduled playback                                                 */
/* -------------------------------------------------------------------------- */

export type GroupPlaybackPhase =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'scheduled'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'
  | 'offline';

export interface GroupDevicePlaybackState {
  deviceId: string;
  deviceName: string;
  videoId: string | null;
  videoName: string | null;
  phase: GroupPlaybackPhase;
  positionSeconds: number;
  /** Reported position minus the server-expected position, in milliseconds. */
  driftMs: number | null;
  syncHealth: 'good' | 'fair' | 'poor' | 'unknown';
  lastSeenAt: string | null;
  error: string | null;
}

export interface GroupPlaybackState {
  id: string | null;
  mode: 'same' | 'mixed';
  status: 'idle' | 'preparing' | 'scheduled' | 'playing' | 'stopped' | 'error';
  scheduledStartAt: string | null;
  leadMs: number;
  positionSeconds: number;
  createdAt: string | null;
  devices: GroupDevicePlaybackState[];
  message: string | null;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/** JSON-safe value used for audit payloads. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
