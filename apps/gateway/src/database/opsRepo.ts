import { newId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import type { AppSettings } from '@vrcc/shared-types';
import { DEFAULT_SETTINGS } from '@vrcc/shared-types';
import type { Database } from './db.js';
import {
  asNumber,
  asString,
  parseJson,
  toAuditLogRecord,
  toCommandRecord,
  toDeviceLogRecord,
  toPlaybackSessionDto,
  toPlaybackSessionRecord,
  type Row,
} from './mappers.js';
import type {
  AuditLogRecord,
  CommandRecord,
  DeviceLogRecord,
  OutboxRecord,
  PageResult,
  PlaybackSessionRecord,
} from './types.js';
import type { CommandRequestStatus, SessionFinalStatus } from '@vrcc/shared-types';

const SESSION_SELECT = `
  SELECT s.*, dev.name AS device_name, v.name AS video_name,
    (CAST(strftime('%s', COALESCE(s.ended_at, ?)) AS INTEGER) - CAST(strftime('%s', s.started_at) AS INTEGER)) AS duration_seconds
  FROM playback_sessions s
  JOIN devices dev ON dev.id = s.device_id
  LEFT JOIN videos v ON v.id = s.video_id
`;

const COMMAND_SELECT = `
  SELECT c.*, d.name AS device_name FROM commands c
  JOIN devices d ON d.id = c.device_id
`;

export class OpsRepository {
  constructor(private readonly db: Database) {}

  /* --------------------------- Playback sessions -------------------------- */

  getOpenSession(deviceId: string): PlaybackSessionRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM playback_sessions
         WHERE device_id = ? AND ended_at IS NULL
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(deviceId) as Row | undefined;
    return row ? toPlaybackSessionRecord(row) : null;
  }

  openSession(input: {
    deviceId: string;
    videoId: string | null;
    positionSeconds: number;
  }): PlaybackSessionRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO playback_sessions
          (id,device_id,video_id,started_at,ended_at,last_position_seconds,final_status,created_at,updated_at)
         VALUES (?,?,?,?,NULL,?,NULL,?,?)`,
      )
      .run(id, input.deviceId, input.videoId, timestamp, input.positionSeconds, timestamp, timestamp);
    const row = this.db.prepare('SELECT * FROM playback_sessions WHERE id = ?').get(id) as Row;
    return toPlaybackSessionRecord(row);
  }

  updateSessionPosition(id: string, positionSeconds: number): void {
    this.db
      .prepare(
        'UPDATE playback_sessions SET last_position_seconds = ?, updated_at = ? WHERE id = ?',
      )
      .run(Math.max(0, positionSeconds), nowIso(), id);
  }

  closeSession(id: string, finalStatus: SessionFinalStatus, positionSeconds: number): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `UPDATE playback_sessions
         SET ended_at = ?, last_position_seconds = ?, final_status = ?, updated_at = ?
         WHERE id = ? AND ended_at IS NULL`,
      )
      .run(timestamp, Math.max(0, positionSeconds), finalStatus, timestamp, id);
  }

  closeOpenSessionsForDevice(
    deviceId: string,
    finalStatus: SessionFinalStatus,
    positionSeconds: number,
  ): number {
    const timestamp = nowIso();
    const result = this.db
      .prepare(
        `UPDATE playback_sessions
         SET ended_at = ?, last_position_seconds = ?, final_status = ?, updated_at = ?
         WHERE device_id = ? AND ended_at IS NULL`,
      )
      .run(timestamp, Math.max(0, positionSeconds), finalStatus, timestamp, deviceId);
    return Number(result.changes);
  }

  getSession(id: string): PlaybackSessionRecord | null {
    const row = this.db.prepare('SELECT * FROM playback_sessions WHERE id = ?').get(id) as
      | Row
      | undefined;
    return row ? toPlaybackSessionRecord(row) : null;
  }

  getSessionDto(id: string): ReturnType<typeof toPlaybackSessionDto> | null {
    const row = this.db
      .prepare(`${SESSION_SELECT} WHERE s.id = ?`)
      .get(nowIso(), id) as Row | undefined;
    return row ? toPlaybackSessionDto(row) : null;
  }

  listSessions(input: {
    page?: number;
    pageSize?: number;
    deviceId?: string;
  } = {}): PageResult<ReturnType<typeof toPlaybackSessionDto>> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 25)));
    const now = nowIso();
    const where = input.deviceId ? ' WHERE s.device_id = ?' : '';
    const args = input.deviceId ? [input.deviceId] : [];
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM playback_sessions s${where}`)
      .get(...args) as Row;
    const rows = this.db
      .prepare(
        `${SESSION_SELECT}${where} ORDER BY s.started_at DESC LIMIT ? OFFSET ?`,
      )
      .all(now, ...args, pageSize, (page - 1) * pageSize) as Row[];
    return {
      items: rows.map(toPlaybackSessionDto),
      page,
      pageSize,
      total: Math.round(asNumber(countRow.count)),
    };
  }

  pruneSessions(cutoffIso: string): number {
    const result = this.db
      .prepare('DELETE FROM playback_sessions WHERE ended_at IS NOT NULL AND started_at < ?')
      .run(cutoffIso);
    return Number(result.changes);
  }

  /* -------------------------------- Commands ------------------------------ */

  insertCommand(input: {
    id: string;
    deviceId: string;
    commandType: string;
    payload: Record<string, unknown>;
    requestedBy: string;
  }): CommandRecord {
    this.db
      .prepare(
        `INSERT INTO commands (id,device_id,command_type,payload,requested_by,status,requested_at,acknowledged_at,error_message)
         VALUES (?,?,?,?,?,'pending',?,NULL,NULL)`,
      )
      .run(
        input.id,
        input.deviceId,
        input.commandType,
        JSON.stringify(input.payload),
        input.requestedBy,
        nowIso(),
      );
    const command = this.getCommand(input.id);
    if (!command) throw new Error('Failed to record command');
    return command;
  }

  getCommand(id: string): (CommandRecord & { deviceName: string }) | null {
    const row = this.db.prepare(`${COMMAND_SELECT} WHERE c.id = ?`).get(id) as Row | undefined;
    if (!row) return null;
    return { ...toCommandRecord(row), deviceName: asString(row.device_name) };
  }

  listCommands(input: {
    deviceId?: string;
    page?: number;
    pageSize?: number;
  } = {}): PageResult<CommandRecord & { deviceName: string }> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize ?? 50)));
    const where = input.deviceId ? ' WHERE c.device_id = ?' : '';
    const args = input.deviceId ? [input.deviceId] : [];
    const countRow = this.db
      .prepare(`SELECT COUNT(*) AS count FROM commands c${where}`)
      .get(...args) as Row;
    const rows = this.db
      .prepare(`${COMMAND_SELECT}${where} ORDER BY c.requested_at DESC LIMIT ? OFFSET ?`)
      .all(...args, pageSize, (page - 1) * pageSize) as Row[];
    return {
      items: rows.map((row) => ({
        ...toCommandRecord(row),
        deviceName: asString(row.device_name),
      })),
      page,
      pageSize,
      total: Math.round(asNumber(countRow.count)),
    };
  }

  updateCommandStatus(
    id: string,
    status: CommandRequestStatus,
    errorMessage: string | null = null,
  ): void {
    const acknowledged = status === 'acknowledged' ? nowIso() : null;
    this.db
      .prepare(
        `UPDATE commands SET status = ?, acknowledged_at = COALESCE(?, acknowledged_at), error_message = ?
         WHERE id = ?`,
      )
      .run(status, acknowledged, errorMessage, id);
  }

  pruneCommands(cutoffIso: string): number {
    const result = this.db
      .prepare('DELETE FROM commands WHERE requested_at < ?')
      .run(cutoffIso);
    return Number(result.changes);
  }

  /* ---------------------------------- Logs -------------------------------- */

  addDeviceLog(deviceId: string, eventType: string, payload: Record<string, unknown>): DeviceLogRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        'INSERT INTO device_logs (id,device_id,event_type,payload,created_at) VALUES (?,?,?,?,?)',
      )
      .run(id, deviceId, eventType, JSON.stringify(payload), timestamp);
    return { id, deviceId, eventType, payload, createdAt: timestamp };
  }

  listDeviceLogs(
    deviceId: string,
    input: { page?: number; pageSize?: number } = {},
  ): PageResult<DeviceLogRecord> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize ?? 50)));
    const countRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM device_logs WHERE device_id = ?')
      .get(deviceId) as Row;
    const rows = this.db
      .prepare(
        `SELECT * FROM device_logs WHERE device_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(deviceId, pageSize, (page - 1) * pageSize) as Row[];
    return {
      items: rows.map(toDeviceLogRecord),
      page,
      pageSize,
      total: Math.round(asNumber(countRow.count)),
    };
  }

  addAudit(input: {
    actor: string;
    action: string;
    entityType: string;
    entityId: string | null;
    payload?: Record<string, unknown>;
  }): AuditLogRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO audit_log (id,actor,action,entity_type,entity_id,payload,created_at)
         VALUES (?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.actor,
        input.action,
        input.entityType,
        input.entityId,
        JSON.stringify(input.payload ?? {}),
        timestamp,
      );
    return {
      id,
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload ?? {},
      createdAt: timestamp,
    };
  }

  listAudit(input: { page?: number; pageSize?: number } = {}): PageResult<AuditLogRecord> {
    const page = Math.max(1, Math.floor(input.page ?? 1));
    const pageSize = Math.min(200, Math.max(1, Math.floor(input.pageSize ?? 50)));
    const countRow = this.db.prepare('SELECT COUNT(*) AS count FROM audit_log').get() as Row;
    const rows = this.db
      .prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(pageSize, (page - 1) * pageSize) as Row[];
    return {
      items: rows.map(toAuditLogRecord),
      page,
      pageSize,
      total: Math.round(asNumber(countRow.count)),
    };
  }

  pruneLogs(cutoffIso: string): void {
    this.db.prepare('DELETE FROM device_logs WHERE created_at < ?').run(cutoffIso);
    this.db.prepare('DELETE FROM audit_log WHERE created_at < ?').run(cutoffIso);
  }

  /* -------------------------------- Settings ------------------------------ */

  getSettings(): AppSettings {
    const rows = this.db
      .prepare('SELECT key, value FROM settings')
      .all() as Array<{ key: string; value: string }>;
    const stored = new Map(rows.map((row) => [row.key, parseJson<unknown>(row.value, null)]));
    const num = (key: keyof AppSettings, min: number, max: number): number => {
      const raw = stored.get(key);
      const value = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : (DEFAULT_SETTINGS[key] as number);
    };
    const confirm = stored.get('confirmDestructiveActions');
    return {
      staleAfterSeconds: num('staleAfterSeconds', 5, 120),
      seekStepSeconds: num('seekStepSeconds', 1, 30),
      previewMaxFps: num('previewMaxFps', 1, 5),
      defaultVolume: num('defaultVolume', 0, 1),
      confirmDestructiveActions:
        typeof confirm === 'boolean' ? confirm : DEFAULT_SETTINGS.confirmDestructiveActions,
    };
  }

  saveSettings(settings: AppSettings): AppSettings {
    const timestamp = nowIso();
    const statement = this.db.prepare(
      `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    for (const [key, value] of Object.entries(settings)) {
      statement.run(key, JSON.stringify(value), timestamp);
    }
    return this.getSettings();
  }

  getInternalSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | Row
      | undefined;
    if (!row) return null;
    const parsed = parseJson<unknown>(row.value, null);
    return typeof parsed === 'string' ? parsed : row.value == null ? null : String(row.value);
  }

  setInternalSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO settings (key,value,updated_at) VALUES (?,?,?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), nowIso());
  }

  /* -------------------------------- Outbox -------------------------------- */

  enqueue(entity: string, operation: 'upsert' | 'delete', payload: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO cloud_outbox (id,entity,operation,payload,created_at,attempts,last_error,synced_at)
         VALUES (?,?,?,?,?,0,NULL,NULL)`,
      )
      .run(newId(), entity, operation, JSON.stringify(payload), nowIso());
  }

  listOutbox(limit = 50): OutboxRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM cloud_outbox WHERE synced_at IS NULL ORDER BY created_at ASC LIMIT ?`,
      )
      .all(limit) as Row[];
    return rows.map((row) => ({
      id: asString(row.id),
      entity: asString(row.entity),
      operation: asString(row.operation, 'upsert') as OutboxRecord['operation'],
      payload: parseJson<Record<string, unknown>>(row.payload, {}),
      createdAt: asString(row.created_at),
      attempts: Math.round(asNumber(row.attempts)),
      lastError: row.last_error ? asString(row.last_error) : null,
      syncedAt: row.synced_at ? asString(row.synced_at) : null,
    }));
  }

  markOutboxSynced(id: string): void {
    this.db
      .prepare('UPDATE cloud_outbox SET synced_at = ?, last_error = NULL WHERE id = ?')
      .run(nowIso(), id);
  }

  markOutboxFailed(id: string, error: string): void {
    this.db
      .prepare(
        'UPDATE cloud_outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
      )
      .run(error.slice(0, 2000), id);
  }

  pendingOutboxCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS count FROM cloud_outbox WHERE synced_at IS NULL')
      .get() as Row;
    return Math.round(asNumber(row.count));
  }

  pruneOutbox(cutoffIso: string): void {
    this.db
      .prepare('DELETE FROM cloud_outbox WHERE synced_at IS NOT NULL AND synced_at < ?')
      .run(cutoffIso);
  }

  /** Exposed for maintenance scripts/tests. */
  vacuum(): void {
    this.db.exec('VACUUM');
  }
}
