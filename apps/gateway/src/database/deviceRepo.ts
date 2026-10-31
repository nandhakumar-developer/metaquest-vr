import { newId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import type { Database } from './db.js';
import { toDeviceRecord, toPairingRecord, asNumber, asString, asNullableString, type Row } from './mappers.js';
import type {
  DeviceRecord,
  DeviceVideoRecord,
  PairingRecord,
  UpdateDeviceRuntimePatch,
} from './types.js';

const RUNTIME_COLUMNS: Record<keyof UpdateDeviceRuntimePatch, string> = {
  name: 'name',
  model: 'model',
  status: 'status',
  lastIpAddress: 'last_ip_address',
  appVersion: 'app_version',
  batteryLevel: 'battery_level',
  charging: 'charging',
  lastSeenAt: 'last_seen_at',
  lastConnectionError: 'last_connection_error',
  capabilities: 'capabilities',
  playback: 'playback',
  storage: 'storage',
  videoCount: 'video_count',
  revokedAt: 'revoked_at',
};

const SERIALIZED_FIELDS = new Set(['capabilities', 'playback', 'storage']);

export class DeviceRepository {
  constructor(private readonly db: Database) {}

  createDevice(input: {
    name: string;
    model: string;
    deviceUuid: string;
    credentialHash: string;
    ipAddress: string | null;
    appVersion: string | null;
    playbackJson: string;
    capabilitiesJson: string;
    storageJson: string;
  }): DeviceRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO devices (id,device_uuid,name,model,status,last_ip_address,app_version,battery_level,charging,
          last_seen_at,paired_at,created_at,updated_at,credential_hash,revoked_at,last_connection_error,
          capabilities,playback,storage,video_count)
         VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,?,NULL,NULL,?,?,?,0)`,
      )
      .run(
        id,
        input.deviceUuid,
        input.name,
        input.model,
        'offline',
        input.ipAddress,
        input.appVersion,
        timestamp,
        timestamp,
        timestamp,
        input.credentialHash,
        input.capabilitiesJson,
        input.playbackJson,
        input.storageJson,
      );
    const device = this.getDevice(id);
    if (!device) throw new Error('Failed to create device');
    return device;
  }

  getDevice(id: string): DeviceRecord | null {
    const row = this.db.prepare('SELECT * FROM devices WHERE id = ?').get(id) as Row | undefined;
    return row ? toDeviceRecord(row) : null;
  }

  getDeviceByUuid(deviceUuid: string): DeviceRecord | null {
    const row = this.db
      .prepare('SELECT * FROM devices WHERE device_uuid = ?')
      .get(deviceUuid) as Row | undefined;
    return row ? toDeviceRecord(row) : null;
  }

  listDevices(): DeviceRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM devices ORDER BY name COLLATE NOCASE ASC')
      .all() as Row[];
    return rows.map(toDeviceRecord);
  }

  updateRuntime(id: string, patch: UpdateDeviceRuntimePatch): DeviceRecord | null {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    for (const [key, column] of Object.entries(RUNTIME_COLUMNS) as Array<
      [keyof UpdateDeviceRuntimePatch, string]
    >) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      if (SERIALIZED_FIELDS.has(key)) {
        values.push(JSON.stringify(value));
      } else if (typeof value === 'boolean') {
        values.push(value ? 1 : 0);
      } else {
        values.push(value as string | number | null);
      }
    }
    if (assignments.length === 0) return this.getDevice(id);
    assignments.push('updated_at = ?');
    values.push(nowIso());
    values.push(id);
    this.db.prepare(`UPDATE devices SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getDevice(id);
  }

  markOnline(id: string, ipAddress: string | null): DeviceRecord | null {
    return this.updateRuntime(id, {
      status: 'online',
      lastIpAddress: ipAddress,
      lastSeenAt: nowIso(),
      lastConnectionError: null,
    });
  }

  markOffline(id: string, error?: string | null): DeviceRecord | null {
    const current = this.getDevice(id);
    if (!current) return null;
    return this.updateRuntime(id, {
      status: current.status === 'revoked' ? 'revoked' : 'offline',
      lastConnectionError: error ?? current.lastConnectionError,
    });
  }

  renameDevice(id: string, name: string): DeviceRecord | null {
    return this.updateRuntime(id, { name });
  }

  revokeDevice(id: string): DeviceRecord | null {
    return this.updateRuntime(id, {
      status: 'revoked',
      revokedAt: nowIso(),
      lastConnectionError: 'Credentials revoked by administrator',
    });
  }

  deleteDevice(id: string): boolean {
    const result = this.db.prepare('DELETE FROM devices WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  getCredentialHash(id: string): string | null {
    const row = this.db
      .prepare('SELECT credential_hash FROM devices WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? String(row.credential_hash) : null;
  }

  /* ------------------------------- Pairing -------------------------------- */

  createPairing(input: {
    code: string;
    tokenHash: string;
    secretHash: string;
    model: string;
    appVersion: string | null;
    ipAddress: string | null;
    expiresAt: string;
  }): PairingRecord {
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO pairing_challenges
          (id,code,token_hash,secret_hash,model,app_version,ip_address,created_at,expires_at,status,attempts,paired_device_id,claimed_at)
         VALUES (?,?,?,?,?,?,?,?,?,'pending',0,NULL,NULL)`,
      )
      .run(
        id,
        input.code,
        input.tokenHash,
        input.secretHash,
        input.model,
        input.appVersion,
        input.ipAddress,
        nowIso(),
        input.expiresAt,
      );
    const pairing = this.getPairingById(id);
    if (!pairing) throw new Error('Failed to create pairing challenge');
    return pairing;
  }

  getPairingById(id: string): PairingRecord | null {
    const row = this.db
      .prepare('SELECT * FROM pairing_challenges WHERE id = ?')
      .get(id) as Row | undefined;
    return row ? toPairingRecord(row) : null;
  }

  getPairingByTokenHash(tokenHash: string): PairingRecord | null {
    const row = this.db
      .prepare('SELECT * FROM pairing_challenges WHERE token_hash = ?')
      .get(tokenHash) as Row | undefined;
    return row ? toPairingRecord(row) : null;
  }

  findActivePairingByCode(code: string): PairingRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM pairing_challenges
         WHERE code = ? AND status = 'pending' AND expires_at > ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(code, nowIso()) as Row | undefined;
    return row ? toPairingRecord(row) : null;
  }

  listPendingPairings(): PairingRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM pairing_challenges
         WHERE status = 'pending' AND expires_at > ?
         ORDER BY created_at DESC`,
      )
      .all(nowIso()) as Row[];
    return rows.map(toPairingRecord);
  }

  setPairingAttempts(id: string, attempts: number): void {
    this.db
      .prepare('UPDATE pairing_challenges SET attempts = ? WHERE id = ?')
      .run(attempts, id);
  }

  markPairingPaired(id: string, deviceId: string): void {
    this.db
      .prepare(
        `UPDATE pairing_challenges SET status = 'paired', paired_device_id = ? WHERE id = ?`,
      )
      .run(deviceId, id);
  }

  markPairingStatus(id: string, status: 'expired' | 'cancelled'): void {
    this.db.prepare('UPDATE pairing_challenges SET status = ? WHERE id = ?').run(status, id);
  }

  markPairingClaimed(id: string): void {
    this.db
      .prepare(
        `UPDATE pairing_challenges SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL`,
      )
      .run(nowIso(), id);
  }

  expirePairings(): number {
    const result = this.db
      .prepare(
        `UPDATE pairing_challenges SET status = 'expired'
         WHERE status = 'pending' AND expires_at <= ?`,
      )
      .run(nowIso());
    return Number(result.changes);
  }

  prunePairings(beforeIso: string): number {
    const result = this.db
      .prepare(
        `DELETE FROM pairing_challenges WHERE status != 'pending' AND created_at < ?`,
      )
      .run(beforeIso);
    return Number(result.changes);
  }

  /* --------------------------- Device inventory --------------------------- */

  upsertDeviceVideo(input: {
    deviceId: string;
    videoId: string;
    downloadStatus: string;
    downloadProgress: number;
    checksumVerified: boolean;
    localFilename: string | null;
    sizeBytes: number | null;
  }): void {
    this.db
      .prepare(
        `INSERT INTO device_videos
          (device_id,video_id,download_status,download_progress,checksum_verified,local_filename,size_bytes,updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(device_id,video_id) DO UPDATE SET
           download_status = excluded.download_status,
           download_progress = excluded.download_progress,
           checksum_verified = excluded.checksum_verified,
           local_filename = excluded.local_filename,
           size_bytes = excluded.size_bytes,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.deviceId,
        input.videoId,
        input.downloadStatus,
        input.downloadProgress,
        input.checksumVerified ? 1 : 0,
        input.localFilename,
        input.sizeBytes,
        nowIso(),
      );
    this.refreshInventoryCount(input.deviceId);
  }

  removeDeviceVideo(deviceId: string, videoId: string): void {
    this.db
      .prepare('DELETE FROM device_videos WHERE device_id = ? AND video_id = ?')
      .run(deviceId, videoId);
    this.refreshInventoryCount(deviceId);
  }

  removeAllDeviceVideos(deviceId: string): void {
    this.db.prepare('DELETE FROM device_videos WHERE device_id = ?').run(deviceId);
    this.refreshInventoryCount(deviceId);
  }

  listDeviceVideos(deviceId: string): Array<
    DeviceVideoRecord & {
      videoName: string;
      checksum: string;
      durationSeconds: number | null;
      projectionType: string;
      stereoLayout: string;
    }
  > {
    const rows = this.db
      .prepare(
        `SELECT dv.*, v.name AS video_name, v.checksum, v.duration_seconds,
                v.projection_type, v.stereo_layout
         FROM device_videos dv
         JOIN videos v ON v.id = dv.video_id
         WHERE dv.device_id = ?
         ORDER BY dv.updated_at DESC`,
      )
      .all(deviceId) as Row[];
    return rows.map((row) => ({
      deviceId: asString(row.device_id),
      videoId: asString(row.video_id),
      downloadStatus: asString(row.download_status, 'ready') as DeviceVideoRecord['downloadStatus'],
      downloadProgress: asNumber(row.download_progress),
      checksumVerified: row.checksum_verified === 1,
      localFilename: asNullableString(row.local_filename),
      sizeBytes: row.size_bytes == null ? null : asNumber(row.size_bytes),
      updatedAt: asString(row.updated_at),
      videoName: asString(row.video_name),
      checksum: asString(row.checksum),
      durationSeconds: row.duration_seconds == null ? null : asNumber(row.duration_seconds),
      projectionType: asString(row.projection_type),
      stereoLayout: asString(row.stereo_layout),
    }));
  }

  refreshInventoryCount(deviceId: string): void {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM device_videos
         WHERE device_id = ? AND download_status = 'ready'`,
      )
      .get(deviceId) as Row;
    this.db
      .prepare('UPDATE devices SET video_count = ?, updated_at = ? WHERE id = ?')
      .run(Math.round(Number(row.count ?? 0)), nowIso(), deviceId);
  }
}
