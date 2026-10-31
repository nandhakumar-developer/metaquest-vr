import { createHmac } from 'node:crypto';
import type { ProjectionType, StereoLayout } from '@vrcc/shared-types';
import type { DeviceRecord, VideoRecord } from '../database/types.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { VideoRepository } from '../database/videoRepo.js';
import type { PairingService } from '../pairing/service.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { randomSecretHex, safeEqualString } from '../utils/ids.js';

const STREAM_SECRET_KEY = 'security.playerStreamSecret';
/** Browsers re-request ranges for a long time; keep the ticket valid for 12h. */
export const STREAM_TICKET_TTL_MS = 12 * 60 * 60 * 1000;

export interface PlayerMediaItem {
  id: string;
  name: string;
  durationSeconds: number | null;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  projectionType: ProjectionType;
  stereoLayout: StereoLayout;
  compatibility: 'verified' | 'unverified' | 'unsupported';
  compatibilityNotes: string | null;
  streamUrl: string;
  thumbnailUrl: string | null;
}

export interface PlayerSessionInfo {
  device: {
    id: string;
    deviceUuid: string;
    name: string;
    model: string;
  };
  videos: PlayerMediaItem[];
  serverTime: string;
  heartbeatIntervalMs: number;
}

/**
 * Issues short-lived, capability-style URLs so a <video> element can range
 * stream from the gateway without sending a device secret in a header (which
 * media elements cannot do). The secret itself never leaves the headset.
 */
export class PlayerMediaService {
  private readonly secret: string;

  constructor(
    private readonly devices: DeviceRepository,
    private readonly videos: VideoRepository,
    private readonly pairing: PairingService,
    private readonly ops: OpsRepository,
    private readonly publicUrl: string,
    private readonly heartbeatIntervalMs: number,
  ) {
    const stored = this.ops.getInternalSetting(STREAM_SECRET_KEY);
    if (stored && stored.length >= 32) {
      this.secret = stored;
    } else {
      this.secret = randomSecretHex(32);
      this.ops.setInternalSetting(STREAM_SECRET_KEY, this.secret);
    }
  }

  /** Verifies a paired headset's device UUID + secret for REST calls. */
  authenticate(deviceUuid: string, secret: string): DeviceRecord {
    const device = this.devices.getDeviceByUuid(deviceUuid);
    if (!device) throw unauthorized('This headset is not paired with the gateway');
    if (device.status === 'revoked' || device.revokedAt) {
      throw forbidden('This headset was unpaired. Pair it again from the dashboard.');
    }
    if (!this.pairing.verifyDeviceSecret(device.id, secret)) {
      throw unauthorized('Invalid device credential');
    }
    return device;
  }

  private sign(videoId: string, expiresAt: number): string {
    return createHmac('sha256', this.secret)
      .update(`${videoId}.${expiresAt}`)
      .digest('base64url');
  }

  private urlFor(pathname: string, videoId: string): string {
    const expiresAt = Date.now() + STREAM_TICKET_TTL_MS;
    const token = this.sign(videoId, expiresAt);
    const base = this.publicUrl.replace(/\/+$/, '');
    return `${base}${pathname}?exp=${expiresAt}&token=${encodeURIComponent(token)}`;
  }

  verifyTicket(videoId: string, expiresAtRaw: string | undefined, token: string | undefined): void {
    const expiresAt = Number(expiresAtRaw);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw forbidden('This media link has expired. Reload the player to get a fresh link.');
    }
    if (!token || !safeEqualString(token, this.sign(videoId, expiresAt))) {
      throw forbidden('This media link is not valid for this video');
    }
  }

  toItem(video: VideoRecord): PlayerMediaItem {
    return {
      id: video.id,
      name: video.name,
      durationSeconds: video.durationSeconds,
      sizeBytes: video.sizeBytes,
      width: video.width,
      height: video.height,
      videoCodec: video.videoCodec,
      audioCodec: video.audioCodec,
      projectionType: video.projectionType,
      stereoLayout: video.stereoLayout,
      compatibility: video.compatibility,
      compatibilityNotes: video.compatibilityNotes,
      streamUrl: this.urlFor(`/api/player/stream/${video.id}`, video.id),
      thumbnailUrl: video.thumbnailPath
        ? this.urlFor(`/api/player/thumbnail/${video.id}`, video.id)
        : null,
    };
  }

  library(): PlayerMediaItem[] {
    return this.videos.listVideos().map((video) => this.toItem(video));
  }

  sessionFor(device: DeviceRecord): PlayerSessionInfo {
    return {
      device: {
        id: device.id,
        deviceUuid: device.deviceUuid,
        name: device.name,
        model: device.model,
      },
      videos: this.library(),
      serverTime: new Date().toISOString(),
      heartbeatIntervalMs: this.heartbeatIntervalMs,
    };
  }
}
