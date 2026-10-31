import { nowIso } from '../utils/time.js';
import type { Database } from './db.js';
import { toDeploymentRecord, asString, asNumber, type Row } from './mappers.js';
import type { DeploymentRecord, UpdateDeploymentPatch } from './types.js';
import type { DeploymentSummary, DownloadStatus } from '@vrcc/shared-types';

const DEPLOYMENT_SELECT = `
  SELECT d.*, v.name AS video_name, dev.name AS device_name
  FROM deployments d
  JOIN videos v ON v.id = d.video_id
  JOIN devices dev ON dev.id = d.device_id
`;

const DEPLOYMENT_COLUMNS: Record<keyof UpdateDeploymentPatch, string> = {
  status: 'status',
  progress: 'progress',
  bytesReceived: 'bytes_received',
  totalBytes: 'total_bytes',
  checksumVerified: 'checksum_verified',
  error: 'error',
  completedAt: 'completed_at',
};

export class DeploymentRepository {
  constructor(private readonly db: Database) {}

  upsertDeployment(input: {
    id: string;
    videoId: string;
    deviceId: string;
    requestedBy: string;
    downloadTokenHash: string;
    totalBytes: number;
  }): DeploymentRecord {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO deployments
          (id,video_id,device_id,status,progress,bytes_received,total_bytes,checksum_verified,error,
           requested_by,download_token_hash,created_at,updated_at,completed_at)
         VALUES (?,?,?,'pending',0,0,?,0,NULL,?,?,?,?,NULL)
         ON CONFLICT(video_id,device_id) DO UPDATE SET
           status = 'pending',
           progress = 0,
           bytes_received = 0,
           total_bytes = excluded.total_bytes,
           checksum_verified = 0,
           error = NULL,
           requested_by = excluded.requested_by,
           download_token_hash = excluded.download_token_hash,
           updated_at = excluded.updated_at,
           completed_at = NULL`,
      )
      .run(
        input.id,
        input.videoId,
        input.deviceId,
        input.totalBytes,
        input.requestedBy,
        input.downloadTokenHash,
        timestamp,
        timestamp,
      );
    const row = this.db
      .prepare(`${DEPLOYMENT_SELECT} WHERE d.video_id = ? AND d.device_id = ?`)
      .get(input.videoId, input.deviceId) as Row | undefined;
    if (!row) throw new Error('Failed to create deployment');
    return toDeploymentRecord(row);
  }

  getDeployment(id: string): DeploymentRecord | null {
    const row = this.db.prepare(`${DEPLOYMENT_SELECT} WHERE d.id = ?`).get(id) as
      | Row
      | undefined;
    return row ? toDeploymentRecord(row) : null;
  }

  getByVideoAndDevice(videoId: string, deviceId: string): DeploymentRecord | null {
    const row = this.db
      .prepare(`${DEPLOYMENT_SELECT} WHERE d.video_id = ? AND d.device_id = ?`)
      .get(videoId, deviceId) as Row | undefined;
    return row ? toDeploymentRecord(row) : null;
  }

  findByTokenHash(tokenHash: string): DeploymentRecord | null {
    const row = this.db
      .prepare(`${DEPLOYMENT_SELECT} WHERE d.download_token_hash = ?`)
      .get(tokenHash) as Row | undefined;
    return row ? toDeploymentRecord(row) : null;
  }

  listDeployments(filters: {
    deviceId?: string;
    videoId?: string;
    limit?: number;
  } = {}): DeploymentRecord[] {
    const clauses: string[] = [];
    const values: Array<string | number> = [];
    if (filters.deviceId) {
      clauses.push('d.device_id = ?');
      values.push(filters.deviceId);
    }
    if (filters.videoId) {
      clauses.push('d.video_id = ?');
      values.push(filters.videoId);
    }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(500, Math.max(1, filters.limit ?? 200));
    const rows = this.db
      .prepare(`${DEPLOYMENT_SELECT}${where} ORDER BY d.updated_at DESC LIMIT ?`)
      .all(...values, limit) as Row[];
    return rows.map(toDeploymentRecord);
  }

  listResumableForDevice(deviceId: string): DeploymentRecord[] {
    const rows = this.db
      .prepare(
        `${DEPLOYMENT_SELECT}
         WHERE d.device_id = ? AND d.status IN ('pending','queued','downloading','verifying')
         ORDER BY d.created_at ASC`,
      )
      .all(deviceId) as Row[];
    return rows.map(toDeploymentRecord);
  }

  updateDeployment(id: string, patch: UpdateDeploymentPatch): DeploymentRecord | null {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    for (const [key, column] of Object.entries(DEPLOYMENT_COLUMNS) as Array<
      [keyof UpdateDeploymentPatch, string]
    >) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      if (typeof value === 'boolean') values.push(value ? 1 : 0);
      else values.push(value);
    }
    if (assignments.length === 0) return this.getDeployment(id);
    assignments.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE deployments SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getDeployment(id);
  }

  summariesForVideos(videoIds: string[]): Map<string, DeploymentSummary[]> {
    const map = new Map<string, DeploymentSummary[]>();
    if (videoIds.length === 0) return map;
    const placeholders = videoIds.map(() => '?').join(',');
    const rows = this.db
      .prepare(
        `SELECT video_id, device_id, status, progress, checksum_verified, updated_at
         FROM deployments WHERE video_id IN (${placeholders})`,
      )
      .all(...videoIds) as Row[];
    for (const row of rows) {
      const videoId = asString(row.video_id);
      const list = map.get(videoId) ?? [];
      list.push({
        deviceId: asString(row.device_id),
        status: asString(row.status, 'pending') as DownloadStatus,
        progress: asNumber(row.progress),
        checksumVerified: row.checksum_verified === 1,
        updatedAt: asString(row.updated_at),
      });
      map.set(videoId, list);
    }
    return map;
  }
}
