import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS local_admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin','operator','viewer')),
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS admin_sessions (
        id TEXT PRIMARY KEY,
        admin_id TEXT NOT NULL REFERENCES local_admins(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        csrf_token TEXT NOT NULL,
        auth_source TEXT NOT NULL CHECK (auth_source IN ('local')),
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions(expires_at);

      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        device_uuid TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('online','offline','revoked')),
        last_ip_address TEXT,
        app_version TEXT,
        battery_level INTEGER,
        charging INTEGER,
        last_seen_at TEXT,
        paired_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        credential_hash TEXT NOT NULL,
        revoked_at TEXT,
        last_connection_error TEXT,
        capabilities TEXT NOT NULL,
        playback TEXT NOT NULL,
        storage TEXT NOT NULL,
        video_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
      CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen_at);

      CREATE TABLE IF NOT EXISTS pairing_challenges (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        secret_hash TEXT NOT NULL,
        model TEXT NOT NULL,
        app_version TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','paired','expired','cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0,
        paired_device_id TEXT REFERENCES devices(id) ON DELETE SET NULL,
        claimed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_challenges(code);
      CREATE INDEX IF NOT EXISTS idx_pairing_status ON pairing_challenges(status, expires_at);

      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        storage_path TEXT NOT NULL,
        storage_backend TEXT NOT NULL DEFAULT 'local' CHECK (storage_backend IN ('local')),
        size_bytes INTEGER NOT NULL,
        duration_seconds REAL,
        width INTEGER,
        height INTEGER,
        frame_rate REAL,
        video_codec TEXT,
        audio_codec TEXT,
        projection_type TEXT NOT NULL CHECK (projection_type IN ('flat','180','360')),
        stereo_layout TEXT NOT NULL CHECK (stereo_layout IN ('mono','sbs','ou')),
        checksum TEXT NOT NULL,
        thumbnail_path TEXT,
        compatibility TEXT NOT NULL DEFAULT 'unverified',
        compatibility_notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_checksum ON videos(checksum);
      CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at);

      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('pending','queued','downloading','verifying','ready','failed','cancelled')),
        progress REAL NOT NULL DEFAULT 0,
        bytes_received INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        checksum_verified INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        requested_by TEXT NOT NULL,
        download_token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE (video_id, device_id)
      );
      CREATE INDEX IF NOT EXISTS idx_deployments_device ON deployments(device_id, status);
      CREATE INDEX IF NOT EXISTS idx_deployments_video ON deployments(video_id);

      CREATE TABLE IF NOT EXISTS device_videos (
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        download_status TEXT NOT NULL DEFAULT 'ready',
        download_progress REAL NOT NULL DEFAULT 1,
        checksum_verified INTEGER NOT NULL DEFAULT 0,
        local_filename TEXT,
        size_bytes INTEGER,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (device_id, video_id)
      );
      CREATE INDEX IF NOT EXISTS idx_device_videos_video ON device_videos(video_id);

      CREATE TABLE IF NOT EXISTS playback_sessions (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        last_position_seconds REAL NOT NULL DEFAULT 0,
        final_status TEXT CHECK (final_status IN ('completed','stopped','error','interrupted')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_device_started ON playback_sessions(device_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON playback_sessions(started_at DESC);

      CREATE TABLE IF NOT EXISTS commands (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        command_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        requested_by TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending','acknowledged','failed','timeout')),
        requested_at TEXT NOT NULL,
        acknowledged_at TEXT,
        error_message TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_commands_device ON commands(device_id, requested_at DESC);

      CREATE TABLE IF NOT EXISTS device_logs (
        id TEXT PRIMARY KEY,
        device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_device_logs_device ON device_logs(device_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
];

export function openDatabase(dataDir: string, filename = 'vrcc.sqlite'): Database {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const location = filename === ':memory:' ? filename : path.join(dataDir, filename);
  const db = new DatabaseSync(location);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Database): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  let current = row?.user_version ?? 0;
  for (const migration of MIGRATIONS) {
    if (migration.version <= current) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.exec(`PRAGMA user_version = ${migration.version}`);
      db.exec('COMMIT');
      current = migration.version;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function closeDatabase(db: Database): void {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}
