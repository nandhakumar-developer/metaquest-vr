import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { DeploymentDto, DownloadStatus } from '@vrcc/shared-types';
import { makeMessage } from '@vrcc/protocol';
import type { GatewayConfig } from '../config.js';
import type { DeploymentRepository } from '../database/deploymentRepo.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { VideoRepository } from '../database/videoRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeploymentRecord, DeviceRecord, VideoRecord } from '../database/types.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { AdminHub } from '../websocket/hub.js';
import type { CloudSyncService } from '../services/cloudSync.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { newId, randomSecretHex, resolveInside, sha256Hex, safeEqualString } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';

const TOKEN_SECRET_KEY = 'security.downloadTokenSecret';

export interface DeployResult {
  deployments: DeploymentDto[];
  errors: Array<{ deviceId: string; message: string }>;
}

export class DeploymentService {
  private readonly secret: string;

  constructor(
    private readonly config: GatewayConfig,
    private readonly deployments: DeploymentRepository,
    private readonly devices: DeviceRepository,
    private readonly videos: VideoRepository,
    private readonly ops: OpsRepository,
    private readonly registry: DeviceRegistry,
    private readonly state: DeviceStateService,
    private readonly hub: AdminHub,
    private readonly cloud: CloudSyncService,
    private readonly publicUrl: string,
  ) {
    const stored = this.ops.getInternalSetting(TOKEN_SECRET_KEY);
    if (stored && stored.length >= 32) {
      this.secret = stored;
    } else {
      this.secret = randomSecretHex(32);
      this.ops.setInternalSetting(TOKEN_SECRET_KEY, this.secret);
    }
  }

  private toDto(record: DeploymentRecord): DeploymentDto {
    return {
      id: record.id,
      videoId: record.videoId,
      videoName: record.videoName,
      deviceId: record.deviceId,
      deviceName: record.deviceName,
      status: record.status,
      progress: record.progress,
      bytesReceived: record.bytesReceived,
      totalBytes: record.totalBytes,
      checksumVerified: record.checksumVerified,
      error: record.error,
      requestedBy: record.requestedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
    };
  }

  private broadcast(record: DeploymentRecord): void {
    this.hub.broadcast({ kind: 'deployment.updated', deployment: this.toDto(record) });
  }

  signToken(deploymentId: string): string {
    return createHmac('sha256', this.secret).update(deploymentId).digest('base64url');
  }

  verifyToken(deploymentId: string, token: string): boolean {
    return safeEqualString(token, this.signToken(deploymentId));
  }

  private downloadUrl(deploymentId: string): string {
    return `${this.publicUrl.replace(/\/+$/, '')}/api/device-downloads/${deploymentId}?token=${encodeURIComponent(
      this.signToken(deploymentId),
    )}`;
  }

  list(filters: { deviceId?: string; videoId?: string; limit?: number } = {}): DeploymentDto[] {
    return this.deployments
      .listDeployments(filters)
      .map((record) => this.toDto(record));
  }

  get(id: string): DeploymentDto {
    const record = this.deployments.getDeployment(id);
    if (!record) throw notFound('Deployment not found');
    return this.toDto(record);
  }

  async deploy(input: {
    videoId: string;
    deviceIds: string[];
    actor: string;
  }): Promise<DeployResult> {
    const video = this.videos.getVideo(input.videoId);
    if (!video) throw notFound('Video not found');
    const absolute = resolveInside(this.config.videoDir, video.storagePath);
    if (!existsSync(absolute)) throw conflict('Video file is missing from local storage');
    if (input.deviceIds.length === 0) throw badRequest('Select at least one device');
    if (input.deviceIds.length > 64) throw badRequest('Too many devices selected');

    const results: DeploymentDto[] = [];
    const errors: Array<{ deviceId: string; message: string }> = [];

    for (const deviceId of [...new Set(input.deviceIds)]) {
      const device = this.devices.getDevice(deviceId);
      if (!device) {
        errors.push({ deviceId, message: 'Device not found' });
        continue;
      }
      if (device.status === 'revoked') {
        errors.push({ deviceId, message: 'Device is unpaired and cannot receive videos' });
        continue;
      }
      if (device.appVersion?.includes('browser')) {
        errors.push({
          deviceId,
          message:
            'Browser players stream from the gateway library directly and do not accept download deployments',
        });
        continue;
      }
      const free = device.storage.freeBytes;
      if (free !== null && video.sizeBytes > free) {
        errors.push({
          deviceId,
          message: `Insufficient storage: needs ${formatBytes(video.sizeBytes)}, ${formatBytes(
            free,
          )} free`,
        });
        continue;
      }

      const existing = this.deployments.getByVideoAndDevice(video.id, device.id);
      const deploymentId = existing?.id ?? newId();
      const token = this.signToken(deploymentId);
      let deployment = this.deployments.upsertDeployment({
        id: deploymentId,
        videoId: video.id,
        deviceId: device.id,
        requestedBy: input.actor,
        downloadTokenHash: sha256Hex(token),
        totalBytes: video.sizeBytes,
      });
      const online = this.registry.isConnected(device.id);
      deployment =
        this.deployments.updateDeployment(deployment.id, {
          status: online ? 'pending' : 'queued',
          error: null,
        }) ?? deployment;
      this.ops.addAudit({
        actor: input.actor,
        action: 'video.deployment_requested',
        entityType: 'device',
        entityId: device.id,
        payload: { videoId: video.id, deploymentId: deployment.id, online },
      });
      this.state.logEvent(device.id, 'video.deployment_requested', {
        videoId: video.id,
        deploymentId: deployment.id,
      });
      this.broadcast(deployment);
      results.push(this.toDto(deployment));

      if (online) this.sendDownload(deployment, device, video);
    }

    return { deployments: results, errors };
  }

  private sendDownload(
    deployment: DeploymentRecord,
    device: DeviceRecord,
    video: VideoRecord,
  ): boolean {
    const message = makeMessage(
      'DOWNLOAD_VIDEO',
      device.deviceUuid,
      {
        deploymentId: deployment.id,
        videoId: video.id,
        name: video.name,
        filename: video.storagePath.split('/').pop() ?? `${video.id}.mp4`,
        url: this.downloadUrl(deployment.id),
        checksum: video.checksum,
        sizeBytes: video.sizeBytes,
        durationSeconds: video.durationSeconds,
        projectionType: video.projectionType,
        stereoLayout: video.stereoLayout,
      },
      newId(),
    );
    const sent = this.registry.send(device.id, JSON.stringify(message));
    if (!sent) {
      const failed = this.deployments.updateDeployment(deployment.id, {
        status: 'queued',
        error: 'Waiting for device to reconnect',
      });
      if (failed) this.broadcast(failed);
      return false;
    }
    const updated = this.deployments.updateDeployment(deployment.id, {
      status: 'pending',
      error: null,
    });
    if (updated) this.broadcast(updated);
    return true;
  }

  onProgress(
    deviceId: string,
    payload: {
      deploymentId: string;
      videoId: string;
      bytesReceived: number;
      totalBytes: number;
      progress: number;
    },
  ): void {
    const deployment = this.deployments.getDeployment(payload.deploymentId);
    if (!deployment || deployment.deviceId !== deviceId) return;
    if (deployment.status === 'cancelled' || deployment.status === 'ready') return;
    if (deployment.videoId !== payload.videoId) return;
    const clampedProgress = Math.min(1, Math.max(0, payload.progress));
    const updated = this.deployments.updateDeployment(deployment.id, {
      status: clampedProgress >= 1 ? 'verifying' : 'downloading',
      progress: clampedProgress,
      bytesReceived: Math.max(0, Math.round(payload.bytesReceived)),
      totalBytes: Math.max(0, Math.round(payload.totalBytes)),
      error: null,
    });
    if (updated) this.broadcast(updated);
  }

  onReady(
    deviceId: string,
    payload: {
      deploymentId: string;
      videoId: string;
      checksum: string;
      sizeBytes: number;
      checksumVerified: boolean;
      localFilename: string;
    },
  ): void {
    const deployment = this.deployments.getDeployment(payload.deploymentId);
    if (!deployment || deployment.deviceId !== deviceId) return;
    if (deployment.status === 'cancelled') return;
    const video = this.videos.getVideo(deployment.videoId);
    if (!video) {
      this.fail(deployment, deviceId, 'Video metadata no longer exists on the gateway');
      return;
    }
    const checksumMatches =
      payload.checksum.toLowerCase() === video.checksum.toLowerCase() &&
      payload.sizeBytes === video.sizeBytes;
    if (!payload.checksumVerified || !checksumMatches) {
      this.fail(
        deployment,
        deviceId,
        'Downloaded file failed checksum or size verification on the headset',
      );
      return;
    }
    const updated = this.deployments.updateDeployment(deployment.id, {
      status: 'ready',
      progress: 1,
      bytesReceived: payload.sizeBytes,
      totalBytes: video.sizeBytes,
      checksumVerified: true,
      error: null,
      completedAt: nowIso(),
    });
    if (!updated) return;
    this.devices.upsertDeviceVideo({
      deviceId,
      videoId: video.id,
      downloadStatus: 'ready',
      downloadProgress: 1,
      checksumVerified: true,
      localFilename: payload.localFilename,
      sizeBytes: video.sizeBytes,
    });
    this.ops.addAudit({
      actor: 'device',
      action: 'video.download_completed',
      entityType: 'device',
      entityId: deviceId,
      payload: { videoId: video.id, deploymentId: deployment.id, checksumVerified: true },
    });
    this.state.logEvent(
      deviceId,
      'video.ready',
      { videoId: video.id, deploymentId: deployment.id },
      true,
    );
    this.cloud.queueDeployment(updated);
    this.broadcast(updated);
    this.dispatchQueued(deviceId);
  }

  private fail(deployment: DeploymentRecord, deviceId: string, message: string): void {
    const updated = this.deployments.updateDeployment(deployment.id, {
      status: 'failed',
      error: message,
    });
    if (updated) {
      this.broadcast(updated);
      this.state.logEvent(deviceId, 'video.download_failed', {
        deploymentId: deployment.id,
        message,
      });
      this.ops.addAudit({
        actor: 'device',
        action: 'video.download_failed',
        entityType: 'device',
        entityId: deviceId,
        payload: { deploymentId: deployment.id, message },
      });
    }
    this.dispatchQueued(deviceId);
  }

  cancel(deploymentId: string, actor: string): DeploymentDto {
    const deployment = this.deployments.getDeployment(deploymentId);
    if (!deployment) throw notFound('Deployment not found');
    if (deployment.status === 'ready') {
      throw conflict('Deployment already completed');
    }
    const updated = this.deployments.updateDeployment(deploymentId, {
      status: 'cancelled',
      error: 'Cancelled by administrator',
    });
    if (!updated) throw notFound('Deployment not found');
    const device = this.devices.getDevice(deployment.deviceId);
    if (device && this.registry.isConnected(device.id)) {
      const message = makeMessage(
        'CANCEL_DOWNLOAD',
        device.deviceUuid,
        { deploymentId: deployment.id, videoId: deployment.videoId },
        newId(),
      );
      this.registry.send(device.id, JSON.stringify(message));
    }
    this.ops.addAudit({
      actor,
      action: 'video.deployment_cancelled',
      entityType: 'device',
      entityId: deployment.deviceId,
      payload: { deploymentId, videoId: deployment.videoId },
    });
    this.broadcast(updated);
    this.dispatchQueued(deployment.deviceId);
    return this.toDto(updated);
  }

  onReconnected(deviceId: string): void {
    const device = this.devices.getDevice(deviceId);
    if (!device) return;
    const resumable = this.deployments.listResumableForDevice(deviceId);
    for (const deployment of resumable) {
      const updated = this.deployments.updateDeployment(deployment.id, {
        status: 'queued',
        progress: 0,
        bytesReceived: 0,
        error: null,
      });
      if (updated) this.broadcast(updated);
    }
    this.dispatchQueued(deviceId);
  }

  private dispatchQueued(deviceId: string): void {
    const device = this.devices.getDevice(deviceId);
    if (!device || !this.registry.isConnected(deviceId)) return;
    const all = this.deployments.listResumableForDevice(deviceId);
    const active = all.filter(
      (deployment) => deployment.status === 'downloading' || deployment.status === 'pending',
    ).length;
    let slots = Math.max(0, this.config.maxConcurrentDownloadsPerDevice - active);
    for (const deployment of all) {
      if (slots <= 0) break;
      if (deployment.status !== 'queued') continue;
      const video = this.videos.getVideo(deployment.videoId);
      if (!video) continue;
      if (this.sendDownload(deployment, device, video)) slots -= 1;
    }
  }

  /** Validates a device download request and returns the media to serve. */
  resolveDownload(deploymentId: string, token: string): {
    deployment: DeploymentRecord;
    video: VideoRecord;
  } {
    if (!this.verifyToken(deploymentId, token)) {
      throw notFound('Download link is not valid');
    }
    const deployment = this.deployments.getDeployment(deploymentId);
    if (!deployment) throw notFound('Deployment not found');
    if (deployment.status === 'cancelled') throw conflict('Deployment was cancelled');
    const video = this.videos.getVideo(deployment.videoId);
    if (!video) throw notFound('Video not found');
    return { deployment, video };
  }

  statusForDevice(deviceId: string): DownloadStatus[] {
    return this.deployments.listDeployments({ deviceId }).map((record) => record.status);
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}
