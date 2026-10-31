import type {
  AdminIdentity,
  AppSettings,
  CommandType,
  DeviceCapabilities,
  DeviceSnapshot,
  DeviceStatus,
  DownloadStatus,
  PlaybackSessionDto,
  PlaybackSnapshot,
  SessionFinalStatus,
  StereoLayout,
  ProjectionType,
  VideoDto,
} from '@vrcc/shared-types';
import type { CommandRequestStatus } from '@vrcc/shared-types';

export interface AdminRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: 'admin' | 'operator' | 'viewer';
  failedAttempts: number;
  lockedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  tokenHash: string;
  csrfToken: string;
  authSource: 'local' | 'supabase';
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface AdminSessionWithAdmin {
  session: AdminSessionRecord;
  admin: AdminRecord;
}

export interface DeviceRecord extends DeviceSnapshot {
  credentialHash: string;
  revokedAt: string | null;
  charging: boolean | null;
}

export type PairingStatus = 'pending' | 'paired' | 'expired' | 'cancelled';

export interface PairingRecord {
  id: string;
  code: string;
  tokenHash: string;
  secretHash: string;
  model: string;
  appVersion: string | null;
  ipAddress: string | null;
  createdAt: string;
  expiresAt: string;
  status: PairingStatus;
  attempts: number;
  pairedDeviceId: string | null;
  claimedAt: string | null;
}

export type VideoRecord = VideoDto;

export interface DeploymentRecord {
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
  downloadTokenHash: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeviceVideoRecord {
  deviceId: string;
  videoId: string;
  downloadStatus: DownloadStatus;
  downloadProgress: number;
  checksumVerified: boolean;
  localFilename: string | null;
  sizeBytes: number | null;
  updatedAt: string;
}

export interface PlaybackSessionRecord {
  id: string;
  deviceId: string;
  videoId: string | null;
  startedAt: string;
  endedAt: string | null;
  lastPositionSeconds: number;
  finalStatus: SessionFinalStatus | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  id: string;
  deviceId: string;
  commandType: CommandType;
  payload: Record<string, unknown>;
  requestedBy: string;
  status: CommandRequestStatus;
  requestedAt: string;
  acknowledgedAt: string | null;
  errorMessage: string | null;
}

export interface DeviceLogRecord {
  id: string;
  deviceId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface OutboxRecord {
  id: string;
  entity: string;
  operation: 'upsert' | 'delete';
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError: string | null;
  syncedAt: string | null;
}

export interface UpdateDeviceRuntimePatch {
  name?: string;
  model?: string;
  status?: DeviceStatus;
  lastIpAddress?: string | null;
  appVersion?: string | null;
  batteryLevel?: number | null;
  charging?: boolean | null;
  lastSeenAt?: string | null;
  lastConnectionError?: string | null;
  capabilities?: DeviceCapabilities;
  playback?: PlaybackSnapshot;
  storage?: { freeBytes: number | null; totalBytes: number | null };
  videoCount?: number;
  revokedAt?: string | null;
}

export interface UpdateDeploymentPatch {
  status?: DownloadStatus;
  progress?: number;
  bytesReceived?: number;
  totalBytes?: number;
  checksumVerified?: boolean;
  error?: string | null;
  completedAt?: string | null;
}

export interface UpdateVideoPatch {
  name?: string;
  projectionType?: ProjectionType;
  stereoLayout?: StereoLayout;
  thumbnailPath?: string | null;
  compatibility?: 'verified' | 'unverified' | 'unsupported';
  compatibilityNotes?: string | null;
  durationSeconds?: number | null;
  width?: number | null;
  height?: number | null;
  frameRate?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
}

export type AdminIdentityRecord = AdminIdentity;

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SettingsKeyValue {
  settings: AppSettings;
  internal: Record<string, string>;
}

export function publicAdminIdentity(
  admin: AdminRecord,
  authSource: 'local' | 'supabase',
  sessionExpiresAt: string,
): AdminIdentity {
  return {
    id: admin.id,
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    authSource,
    sessionExpiresAt,
  };
}

export type { PlaybackSessionDto };
