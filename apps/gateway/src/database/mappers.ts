import type {
  CommandRequestStatus,
  DeviceCapabilities,
  DeviceStatus,
  DownloadStatus,
  PlaybackSessionDto,
  PlaybackSnapshot,
  ProjectionType,
  SessionFinalStatus,
  StereoLayout,
  VideoDto,
} from '@vrcc/shared-types';
import { EMPTY_PLAYBACK, DEFAULT_CAPABILITIES } from '@vrcc/shared-types';
import type {
  AuditLogRecord,
  CommandRecord,
  DeploymentRecord,
  DeviceLogRecord,
  DeviceRecord,
  DeviceVideoRecord,
  PairingRecord,
  PlaybackSessionRecord,
  VideoRecord,
} from './types.js';

export type Row = Record<string, unknown>;

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asBool(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export function asBoolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return asBool(value);
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toDeviceRecord(row: Row): DeviceRecord {
  const playback = parseJson<PlaybackSnapshot>(row.playback, {
    ...EMPTY_PLAYBACK,
    updatedAt: asString(row.updated_at),
  });
  const capabilities = parseJson<DeviceCapabilities>(row.capabilities, DEFAULT_CAPABILITIES);
  const storage = parseJson<{ freeBytes: number | null; totalBytes: number | null }>(row.storage, {
    freeBytes: null,
    totalBytes: null,
  });
  const status = asString(row.status, 'offline') as DeviceStatus;
  return {
    id: asString(row.id),
    deviceUuid: asString(row.device_uuid),
    name: asString(row.name),
    model: asString(row.model),
    status,
    online: status === 'online',
    ipAddress: asNullableString(row.last_ip_address),
    appVersion: asNullableString(row.app_version),
    batteryLevel: asNullableNumber(row.battery_level),
    lastSeenAt: asNullableString(row.last_seen_at),
    pairedAt: asNullableString(row.paired_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    playback,
    capabilities,
    storage,
    previewActive: false,
    lastConnectionError: asNullableString(row.last_connection_error),
    videoCount: Math.max(0, Math.round(asNumber(row.video_count))),
    credentialHash: asString(row.credential_hash),
    revokedAt: asNullableString(row.revoked_at),
    charging: asBoolOrNull(row.charging),
  };
}

export function toPairingRecord(row: Row): PairingRecord {
  return {
    id: asString(row.id),
    code: asString(row.code),
    tokenHash: asString(row.token_hash),
    secretHash: asString(row.secret_hash),
    model: asString(row.model),
    appVersion: asNullableString(row.app_version),
    ipAddress: asNullableString(row.ip_address),
    createdAt: asString(row.created_at),
    expiresAt: asString(row.expires_at),
    status: asString(row.status, 'pending') as PairingRecord['status'],
    attempts: Math.round(asNumber(row.attempts)),
    pairedDeviceId: asNullableString(row.paired_device_id),
    claimedAt: asNullableString(row.claimed_at),
  };
}

export function toVideoRecord(row: Row): VideoRecord {
  return {
    id: asString(row.id),
    name: asString(row.name),
    originalFilename: asString(row.original_filename),
    storagePath: asString(row.storage_path),
    storageBackend: asString(row.storage_backend, 'local') as VideoDto['storageBackend'],
    sizeBytes: Math.round(asNumber(row.size_bytes)),
    durationSeconds: asNullableNumber(row.duration_seconds),
    width: asNullableNumber(row.width),
    height: asNullableNumber(row.height),
    frameRate: asNullableNumber(row.frame_rate),
    videoCodec: asNullableString(row.video_codec),
    audioCodec: asNullableString(row.audio_codec),
    projectionType: asString(row.projection_type, 'flat') as ProjectionType,
    stereoLayout: asString(row.stereo_layout, 'mono') as StereoLayout,
    checksum: asString(row.checksum),
    thumbnailPath: asNullableString(row.thumbnail_path),
    compatibility: asString(row.compatibility, 'unverified') as VideoDto['compatibility'],
    compatibilityNotes: asNullableString(row.compatibility_notes),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function toDeploymentRecord(row: Row): DeploymentRecord {
  return {
    id: asString(row.id),
    videoId: asString(row.video_id),
    videoName: asString(row.video_name, 'Unknown video'),
    deviceId: asString(row.device_id),
    deviceName: asString(row.device_name, 'Unknown device'),
    status: asString(row.status, 'pending') as DownloadStatus,
    progress: asNumber(row.progress),
    bytesReceived: Math.round(asNumber(row.bytes_received)),
    totalBytes: Math.round(asNumber(row.total_bytes)),
    checksumVerified: asBool(row.checksum_verified),
    error: asNullableString(row.error),
    requestedBy: asString(row.requested_by),
    downloadTokenHash: asString(row.download_token_hash),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    completedAt: asNullableString(row.completed_at),
  };
}

export function toDeviceVideoRecord(row: Row): DeviceVideoRecord {
  return {
    deviceId: asString(row.device_id),
    videoId: asString(row.video_id),
    downloadStatus: asString(row.download_status, 'ready') as DownloadStatus,
    downloadProgress: asNumber(row.download_progress),
    checksumVerified: asBool(row.checksum_verified),
    localFilename: asNullableString(row.local_filename),
    sizeBytes: asNullableNumber(row.size_bytes),
    updatedAt: asString(row.updated_at),
  };
}

export function toPlaybackSessionRecord(row: Row): PlaybackSessionRecord {
  return {
    id: asString(row.id),
    deviceId: asString(row.device_id),
    videoId: asNullableString(row.video_id),
    startedAt: asString(row.started_at),
    endedAt: asNullableString(row.ended_at),
    lastPositionSeconds: asNumber(row.last_position_seconds),
    finalStatus: asNullableString(row.final_status) as SessionFinalStatus | null,
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export function toPlaybackSessionDto(row: Row): PlaybackSessionDto {
  return {
    id: asString(row.id),
    deviceId: asString(row.device_id),
    deviceName: asString(row.device_name, 'Unknown device'),
    videoId: asNullableString(row.video_id),
    videoName: asNullableString(row.video_name),
    startedAt: asString(row.started_at),
    endedAt: asNullableString(row.ended_at),
    lastPositionSeconds: asNumber(row.last_position_seconds),
    finalStatus: asNullableString(row.final_status) as SessionFinalStatus | null,
    durationSeconds: asNullableNumber(row.duration_seconds),
  };
}

export function toCommandRecord(row: Row): CommandRecord {
  return {
    id: asString(row.id),
    deviceId: asString(row.device_id),
    commandType: asString(row.command_type) as CommandRecord['commandType'],
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    requestedBy: asString(row.requested_by),
    status: asString(row.status, 'pending') as CommandRequestStatus,
    requestedAt: asString(row.requested_at),
    acknowledgedAt: asNullableString(row.acknowledged_at),
    errorMessage: asNullableString(row.error_message),
  };
}

export function toDeviceLogRecord(row: Row): DeviceLogRecord {
  return {
    id: asString(row.id),
    deviceId: asString(row.device_id),
    eventType: asString(row.event_type),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    createdAt: asString(row.created_at),
  };
}

export function toAuditLogRecord(row: Row): AuditLogRecord {
  return {
    id: asString(row.id),
    actor: asString(row.actor),
    action: asString(row.action),
    entityType: asString(row.entity_type),
    entityId: asNullableString(row.entity_id),
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    createdAt: asString(row.created_at),
  };
}
