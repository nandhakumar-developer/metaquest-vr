import { nowIso } from '../utils/time.js';
import type { Database } from './db.js';
import { toVideoRecord, type Row } from './mappers.js';
import type { UpdateVideoPatch, VideoRecord } from './types.js';

const VIDEO_COLUMNS: Record<keyof UpdateVideoPatch, string> = {
  name: 'name',
  projectionType: 'projection_type',
  stereoLayout: 'stereo_layout',
  thumbnailPath: 'thumbnail_path',
  compatibility: 'compatibility',
  compatibilityNotes: 'compatibility_notes',
  durationSeconds: 'duration_seconds',
  width: 'width',
  height: 'height',
  frameRate: 'frame_rate',
  videoCodec: 'video_codec',
  audioCodec: 'audio_codec',
};

export class VideoRepository {
  constructor(private readonly db: Database) {}

  createVideo(input: {
    id: string;
    name: string;
    originalFilename: string;
    storagePath: string;
    sizeBytes: number;
    durationSeconds: number | null;
    width: number | null;
    height: number | null;
    frameRate: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    projectionType: VideoRecord['projectionType'];
    stereoLayout: VideoRecord['stereoLayout'];
    checksum: string;
    thumbnailPath: string | null;
    compatibility: VideoRecord['compatibility'];
    compatibilityNotes: string | null;
  }): VideoRecord {
    const timestamp = nowIso();
    this.db
      .prepare(
        `INSERT INTO videos
          (id,name,original_filename,storage_path,storage_backend,size_bytes,duration_seconds,width,height,
           frame_rate,video_codec,audio_codec,projection_type,stereo_layout,checksum,thumbnail_path,
           compatibility,compatibility_notes,created_at,updated_at)
         VALUES (?,?,?,?,'local',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        input.id,
        input.name,
        input.originalFilename,
        input.storagePath,
        input.sizeBytes,
        input.durationSeconds,
        input.width,
        input.height,
        input.frameRate,
        input.videoCodec,
        input.audioCodec,
        input.projectionType,
        input.stereoLayout,
        input.checksum,
        input.thumbnailPath,
        input.compatibility,
        input.compatibilityNotes,
        timestamp,
        timestamp,
      );
    const video = this.getVideo(input.id);
    if (!video) throw new Error('Failed to create video record');
    return video;
  }

  getVideo(id: string): VideoRecord | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as Row | undefined;
    return row ? toVideoRecord(row) : null;
  }

  findByChecksum(checksum: string): VideoRecord | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE checksum = ?').get(checksum) as
      | Row
      | undefined;
    return row ? toVideoRecord(row) : null;
  }

  listVideos(): VideoRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM videos ORDER BY created_at DESC')
      .all() as Row[];
    return rows.map(toVideoRecord);
  }

  updateVideo(id: string, patch: UpdateVideoPatch): VideoRecord | null {
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    for (const [key, column] of Object.entries(VIDEO_COLUMNS) as Array<
      [keyof UpdateVideoPatch, string]
    >) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(value);
    }
    if (assignments.length === 0) return this.getVideo(id);
    assignments.push('updated_at = ?');
    values.push(nowIso(), id);
    this.db.prepare(`UPDATE videos SET ${assignments.join(', ')} WHERE id = ?`).run(...values);
    return this.getVideo(id);
  }

  deleteVideo(id: string): boolean {
    const result = this.db.prepare('DELETE FROM videos WHERE id = ?').run(id);
    return Number(result.changes) > 0;
  }

  isLoadedOnAnyDevice(videoId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count FROM devices
         WHERE json_extract(playback, '$.videoId') = ? AND status = 'online'`,
      )
      .get(videoId) as Row;
    return Number(row.count ?? 0) > 0;
  }
}
