import { newId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';
import type { Database } from './db.js';
import { asNumber, asString, asNullableString, type Row } from './mappers.js';
import type { AdminRecord, AdminSessionRecord, AdminSessionWithAdmin } from './types.js';

function toAdmin(row: Row): AdminRecord {
  return {
    id: asString(row.id),
    email: asString(row.email),
    displayName: asString(row.display_name),
    passwordHash: asString(row.password_hash),
    role: asString(row.role, 'viewer') as AdminRecord['role'],
    failedAttempts: Math.round(asNumber(row.failed_attempts)),
    lockedUntil: asNullableString(row.locked_until),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function toSession(row: Row): AdminSessionRecord {
  return {
    id: asString(row.id),
    adminId: asString(row.admin_id),
    tokenHash: asString(row.token_hash),
    csrfToken: asString(row.csrf_token),
    authSource: asString(row.auth_source, 'local') as AdminSessionRecord['authSource'],
    expiresAt: asString(row.expires_at),
    createdAt: asString(row.created_at),
    lastSeenAt: asString(row.last_seen_at),
  };
}

export class AdminRepository {
  constructor(private readonly db: Database) {}

  countAdmins(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS count FROM local_admins').get() as Row;
    return Math.round(asNumber(row.count));
  }

  createAdmin(input: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: AdminRecord['role'];
  }): AdminRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO local_admins (id,email,display_name,password_hash,role,failed_attempts,locked_until,created_at,updated_at)
         VALUES (?,?,?,?,?,0,NULL,?,?)`,
      )
      .run(
        id,
        input.email.trim(),
        input.displayName.trim(),
        input.passwordHash,
        input.role ?? 'admin',
        timestamp,
        timestamp,
      );
    const admin = this.getAdminById(id);
    if (!admin) throw new Error('Failed to create administrator');
    return admin;
  }

  getAdminById(id: string): AdminRecord | null {
    const row = this.db.prepare('SELECT * FROM local_admins WHERE id = ?').get(id) as Row | undefined;
    return row ? toAdmin(row) : null;
  }

  getAdminByEmail(email: string): AdminRecord | null {
    const row = this.db
      .prepare('SELECT * FROM local_admins WHERE email = ? COLLATE NOCASE')
      .get(email.trim()) as Row | undefined;
    return row ? toAdmin(row) : null;
  }

  updatePassword(id: string, passwordHash: string): void {
    this.db
      .prepare('UPDATE local_admins SET password_hash = ?, updated_at = ? WHERE id = ?')
      .run(passwordHash, nowIso(), id);
  }

  updateProfile(id: string, displayName: string): void {
    this.db
      .prepare('UPDATE local_admins SET display_name = ?, updated_at = ? WHERE id = ?')
      .run(displayName, nowIso(), id);
  }

  recordFailedLogin(id: string, threshold = 5, lockMinutes = 15): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `UPDATE local_admins
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END,
             updated_at = ?
         WHERE id = ?`,
      )
      .run(threshold, new Date(Date.now() + lockMinutes * 60_000).toISOString(), timestamp, id);
  }

  resetFailedLogins(id: string): void {
    this.db
      .prepare(
        'UPDATE local_admins SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?',
      )
      .run(nowIso(), id);
  }

  createSession(input: {
    adminId: string;
    tokenHash: string;
    csrfToken: string;
    authSource: 'local';
    expiresAt: string;
  }): AdminSessionRecord {
    const id = newId();
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO admin_sessions (id,admin_id,token_hash,csrf_token,auth_source,expires_at,created_at,last_seen_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run(
        id,
        input.adminId,
        input.tokenHash,
        input.csrfToken,
        input.authSource,
        input.expiresAt,
        timestamp,
        timestamp,
      );
    const row = this.db.prepare('SELECT * FROM admin_sessions WHERE id = ?').get(id) as Row;
    return toSession(row);
  }

  getSessionWithAdmin(tokenHash: string): AdminSessionWithAdmin | null {
    const row = this.db
      .prepare(
        `SELECT s.id AS session_id, s.admin_id, s.token_hash, s.csrf_token, s.auth_source,
                s.expires_at, s.created_at AS session_created_at, s.last_seen_at,
                a.*
         FROM admin_sessions s
         JOIN local_admins a ON a.id = s.admin_id
         WHERE s.token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, nowIso()) as Row | undefined;
    if (!row) return null;
    const session: AdminSessionRecord = {
      id: asString(row.session_id),
      adminId: asString(row.admin_id),
      tokenHash: asString(row.token_hash),
      csrfToken: asString(row.csrf_token),
      authSource: asString(row.auth_source, 'local') as AdminSessionRecord['authSource'],
      expiresAt: asString(row.expires_at),
      createdAt: asString(row.session_created_at),
      lastSeenAt: asString(row.last_seen_at),
    };
    const adminRow: Row = {
      id: row.id,
      email: row.email,
      display_name: row.display_name,
      password_hash: row.password_hash,
      role: row.role,
      failed_attempts: row.failed_attempts,
      locked_until: row.locked_until,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
    return { session, admin: toAdmin(adminRow) };
  }

  touchSession(id: string): void {
    this.db.prepare('UPDATE admin_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), id);
  }

  deleteSession(id: string): void {
    this.db.prepare('DELETE FROM admin_sessions WHERE id = ?').run(id);
  }

  deleteSessionsForAdmin(adminId: string): void {
    this.db.prepare('DELETE FROM admin_sessions WHERE admin_id = ?').run(adminId);
  }

  deleteOtherSessionsForAdmin(adminId: string, keepSessionId: string): void {
    this.db
      .prepare('DELETE FROM admin_sessions WHERE admin_id = ? AND id != ?')
      .run(adminId, keepSessionId);
  }

  pruneExpiredSessions(): number {
    const result = this.db
      .prepare('DELETE FROM admin_sessions WHERE expires_at <= ?')
      .run(nowIso());
    return Number(result.changes);
  }
}
