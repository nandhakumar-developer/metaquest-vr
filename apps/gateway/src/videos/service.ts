import { createReadStream, existsSync, mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { makeMessage } from '@vrcc/protocol';
import type { ProjectionType, StereoLayout, VideoDto } from '@vrcc/shared-types';
import type { GatewayConfig } from '../config.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { VideoRepository } from '../database/videoRepo.js';
import type { DeploymentRepository } from '../database/deploymentRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { VideoRecord } from '../database/types.js';
import type { CloudSyncService } from '../services/cloudSync.js';
import type { AdminHub } from '../websocket/hub.js';
import type { MediaService } from '../services/media.js';
import { conflict, notFound } from '../utils/errors.js';
import { newId, sanitizeFilename, resolveInside } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';

export interface IngestVideoInput {
  tempPath: string;
  originalFilename: string;
  sizeBytes: number;
  checksum: string;
  name: string;
  projectionType: ProjectionType;
  stereoLayout: StereoLayout;
}

export class VideoService {
  constructor(
    private readonly config: GatewayConfig,
    private readonly videos: VideoRepository,
    private readonly deployments: DeploymentRepository,
    private readonly ops: OpsRepository,
    private readonly hub: AdminHub,
    private readonly cloud: CloudSyncService,
    private readonly media: MediaService,
    private readonly registry: DeviceRegistry,
  ) {}

  /** Push a lightweight invalidation so connected players fetch the new library. */
  private notifyPlayers(): void {
    for (const connection of this.registry.list()) {
      this.registry.send(
        connection.deviceId,
        JSON.stringify(makeMessage('LIBRARY_UPDATED', connection.deviceUuid, {})),
      );
    }
  }

  private toDto(video: VideoRecord): VideoDto {
    return {
      ...video,
      deployments: this.deployments.summariesForVideos([video.id]).get(video.id) ?? [],
    };
  }

  list(): VideoDto[] {
    const videos = this.videos.listVideos();
    const summaries = this.deployments.summariesForVideos(videos.map((video) => video.id));
    return videos.map((video) => ({
      ...video,
      deployments: summaries.get(video.id) ?? [],
    }));
  }

  get(id: string): VideoRecord {
    const video = this.videos.getVideo(id);
    if (!video) throw notFound('Video not found');
    return video;
  }

  getDto(id: string): VideoDto {
    return this.toDto(this.get(id));
  }

  async ingest(input: IngestVideoInput): Promise<VideoDto> {
    const duplicate = this.videos.findByChecksum(input.checksum);
    if (duplicate) {
      await this.safeUnlink(input.tempPath);
      throw conflict('This exact file is already in the library', {
        videoId: duplicate.id,
        name: duplicate.name,
      });
    }

    const id = newId();
    const directory = resolveInside(this.config.videoDir, id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const filename = sanitizeFilename(input.originalFilename);
    const destination = resolveInside(directory, filename);
    const thumbnailDestination = path.join(directory, 'thumb.jpg');

    try {
      const probe = await this.media.probe(input.tempPath, input.originalFilename);
      const thumbnailAt =
        probe.durationSeconds && probe.durationSeconds > 3
          ? Math.min(3, Math.floor(probe.durationSeconds / 3))
          : 0;
      const thumbnailOk = await this.media.generateThumbnail(
        input.tempPath,
        thumbnailDestination,
        thumbnailAt,
      );
      try {
        await fs.rename(input.tempPath, destination);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
          await fs.copyFile(input.tempPath, destination);
          await fs.unlink(input.tempPath);
        } else {
          throw error;
        }
      }
      const stored = await fs.stat(destination);
      if (stored.size !== input.sizeBytes) {
        throw new Error('Stored file size does not match the uploaded stream');
      }

      const displayName = input.name.trim().slice(0, 200) || filename;
      const video = this.videos.createVideo({
        id,
        name: displayName,
        originalFilename: input.originalFilename,
        storagePath: path.posix.join(id, filename),
        sizeBytes: input.sizeBytes,
        durationSeconds: probe.durationSeconds,
        width: probe.width,
        height: probe.height,
        frameRate: probe.frameRate,
        videoCodec: probe.videoCodec,
        audioCodec: probe.audioCodec,
        projectionType: input.projectionType,
        stereoLayout: input.stereoLayout,
        checksum: input.checksum,
        thumbnailPath: thumbnailOk ? path.posix.join(id, 'thumb.jpg') : null,
        compatibility: probe.compatibility,
        compatibilityNotes: probe.compatibilityNotes,
      });
      this.ops.addAudit({
        actor: 'system',
        action: 'video.uploaded',
        entityType: 'video',
        entityId: video.id,
        payload: {
          name: video.name,
          sizeBytes: video.sizeBytes,
          checksum: video.checksum,
          compatibility: video.compatibility,
        },
      });
      this.cloud.queueVideo(video);
      const dto = this.toDto(video);
      this.hub.broadcast({ kind: 'video.updated', video: dto });
      this.notifyPlayers();
      return dto;
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
      await this.safeUnlink(input.tempPath);
      throw error;
    }
  }

  update(
    id: string,
    patch: {
      name?: string;
      projectionType?: ProjectionType;
      stereoLayout?: StereoLayout;
    },
    actor: string,
  ): VideoDto {
    const existing = this.get(id);
    const updated = this.videos.updateVideo(id, {
      ...(patch.name !== undefined ? { name: patch.name.trim().slice(0, 200) } : {}),
      ...(patch.projectionType !== undefined ? { projectionType: patch.projectionType } : {}),
      ...(patch.stereoLayout !== undefined ? { stereoLayout: patch.stereoLayout } : {}),
    });
    if (!updated) throw notFound('Video not found');
    this.ops.addAudit({
      actor,
      action: 'video.updated',
      entityType: 'video',
      entityId: id,
      payload: { changes: patch, previousName: existing.name },
    });
    this.cloud.queueVideo(updated);
    const dto = this.toDto(updated);
    this.hub.broadcast({ kind: 'video.updated', video: dto });
    this.notifyPlayers();
    return dto;
  }

  async delete(id: string, actor: string): Promise<void> {
    const video = this.get(id);
    if (this.videos.isLoadedOnAnyDevice(id)) {
      throw conflict(
        'This video is currently loaded on an online headset. Stop and unload it before deleting.',
      );
    }
    const directory = resolveInside(this.config.videoDir, id);
    await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined);
    this.videos.deleteVideo(id);
    this.ops.addAudit({
      actor,
      action: 'video.deleted',
      entityType: 'video',
      entityId: id,
      payload: { name: video.name, checksum: video.checksum },
    });
    this.cloud.queueVideoDelete(id);
    this.hub.broadcast({ kind: 'video.removed', videoId: id });
    this.notifyPlayers();
  }

  absolutePath(video: VideoRecord): string {
    const resolved = resolveInside(this.config.videoDir, video.storagePath);
    if (!existsSync(resolved)) {
      throw notFound('Video file is missing from local storage');
    }
    return resolved;
  }

  thumbnailPath(video: VideoRecord): string | null {
    if (!video.thumbnailPath) return null;
    const resolved = resolveInside(this.config.videoDir, video.thumbnailPath);
    return existsSync(resolved) ? resolved : null;
  }

  createReadStream(video: VideoRecord): ReturnType<typeof createReadStream> {
    return createReadStream(this.absolutePath(video));
  }

  private async safeUnlink(filePath: string): Promise<void> {
    await fs.unlink(filePath).catch(() => undefined);
  }

  /** Exposed for tests: total library size. */
  totalBytes(): number {
    return this.videos.listVideos().reduce((sum, video) => sum + video.sizeBytes, 0);
  }

  now(): string {
    return nowIso();
  }
}
