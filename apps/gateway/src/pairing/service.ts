import { toDataURL } from 'qrcode';
import {
  DEFAULT_CAPABILITIES,
  EMPTY_PLAYBACK,
  type PairingRequestDto,
} from '@vrcc/shared-types';
import type { GatewayConfig } from '../config.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { Database } from '../database/db.js';
import type { PairingRecord } from '../database/types.js';
import type { AdminHub } from '../websocket/hub.js';
import type { CloudSyncService } from '../services/cloudSync.js';
import { badRequest, conflict, forbidden, notFound, tooManyRequests } from '../utils/errors.js';
import { newId, randomPairingCode, randomToken, sha256Hex, safeEqualHex } from '../utils/ids.js';
import { addSecondsIso, ageMs, isExpired, nowIso } from '../utils/time.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
/** Credentials remain claimable for this long after the code was generated. */
const CREDENTIAL_CLAIM_WINDOW_MS = 15 * 60_000;

export interface PairingChallengeResult {
  id: string;
  code: string;
  pollToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  gatewayUrl: string;
  pairingUri: string;
}

export interface PairingClaimResult {
  status: 'pending' | 'paired' | 'expired' | 'cancelled';
  expiresAt: string;
  device?: {
    deviceId: string;
    deviceUuid: string;
    name: string;
    wsUrl: string;
  };
}

export class PairingService {
  private readonly requestsByIp = new Map<string, number[]>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly db: Database,
    private readonly devices: DeviceRepository,
    private readonly ops: OpsRepository,
    private readonly hub: AdminHub,
    private readonly cloud: CloudSyncService,
    private readonly wsUrl: string,
    private readonly adminUrl: string,
  ) {}

  private rateLimit(ip: string): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    const entries = (this.requestsByIp.get(ip) ?? []).filter((time) => time > windowStart);
    if (entries.length >= 10) {
      throw tooManyRequests('Too many pairing requests from this address. Wait a minute.');
    }
    entries.push(now);
    this.requestsByIp.set(ip, entries);
    if (this.requestsByIp.size > 2000) {
      for (const [key, value] of this.requestsByIp) {
        if (value.every((time) => time <= windowStart)) this.requestsByIp.delete(key);
      }
    }
  }

  async createChallenge(input: {
    secretHash: string;
    model: string;
    appVersion: string;
    ipAddress: string;
  }): Promise<PairingChallengeResult> {
    this.rateLimit(input.ipAddress);
    this.devices.expirePairings();
    const expiresAt = addSecondsIso(this.config.pairingTtlSeconds);

    let code = '';
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const candidate = randomPairingCode();
      if (!this.devices.findActivePairingByCode(candidate)) {
        code = candidate;
        break;
      }
    }
    if (!code) throw conflict('Unable to allocate a pairing code. Try again.');

    const pollToken = randomToken(32);
    const model = input.model.replace(CONTROL_CHARS, '').slice(0, 96) || 'Meta Quest';
    const pairing = this.devices.createPairing({
      code,
      tokenHash: sha256Hex(pollToken),
      secretHash: input.secretHash.toLowerCase(),
      model,
      appVersion: input.appVersion.replace(CONTROL_CHARS, '').slice(0, 64) || null,
      ipAddress: input.ipAddress,
      expiresAt,
    });
    this.ops.addAudit({
      actor: 'device',
      action: 'pairing.requested',
      entityType: 'pairing',
      entityId: pairing.id,
      payload: { model, ipAddress: input.ipAddress },
    });
    this.hub.broadcast({ kind: 'pairing.pending', request: this.toDto(pairing) });
    return {
      id: pairing.id,
      code: pairing.code,
      pollToken,
      expiresAt: pairing.expiresAt,
      expiresInSeconds: this.config.pairingTtlSeconds,
      gatewayUrl: this.wsUrl,
      pairingUri: `vrcc://pair?gateway=${encodeURIComponent(this.wsUrl)}&code=${pairing.code}`,
    };
  }

  async claimWithToken(input: { pairingId: string; pollToken: string }): Promise<PairingClaimResult> {
    const pairing = this.devices.getPairingByTokenHash(sha256Hex(input.pollToken));
    if (!pairing || pairing.id !== input.pairingId) {
      throw notFound('Pairing session not found');
    }
    if (
      pairing.status === 'pending' &&
      (isExpired(pairing.expiresAt) || ageMs(pairing.createdAt) > CREDENTIAL_CLAIM_WINDOW_MS)
    ) {
      this.devices.markPairingStatus(pairing.id, 'expired');
      this.hub.broadcast({ kind: 'pairing.resolved', requestId: pairing.id, deviceId: null });
      return { status: 'expired', expiresAt: pairing.expiresAt };
    }
    if (pairing.status === 'pending') {
      return { status: 'pending', expiresAt: pairing.expiresAt };
    }
    if (pairing.status !== 'paired' || !pairing.pairedDeviceId) {
      return { status: pairing.status, expiresAt: pairing.expiresAt };
    }
    if (ageMs(pairing.createdAt) > CREDENTIAL_CLAIM_WINDOW_MS) {
      return { status: 'expired', expiresAt: pairing.expiresAt };
    }
    const device = this.devices.getDevice(pairing.pairedDeviceId);
    if (!device) {
      return { status: 'cancelled', expiresAt: pairing.expiresAt };
    }
    this.devices.markPairingClaimed(pairing.id);
    this.ops.addAudit({
      actor: 'device',
      action: 'pairing.credentials_claimed',
      entityType: 'device',
      entityId: device.id,
      payload: { pairingId: pairing.id },
    });
    return {
      status: 'paired',
      expiresAt: pairing.expiresAt,
      device: {
        deviceId: device.id,
        deviceUuid: device.deviceUuid,
        name: device.name,
        wsUrl: this.wsUrl,
      },
    };
  }

  confirmPairing(input: { code: string; name: string; actor: string }): PairingRequestDto {
    const pairing = this.devices.findActivePairingByCode(input.code.trim());
    if (!pairing) throw notFound('Invalid or expired pairing code');
    if (pairing.attempts >= this.config.pairingMaxAttempts) {
      this.devices.markPairingStatus(pairing.id, 'cancelled');
      throw forbidden('Too many attempts for this pairing code; start a new pairing session');
    }
    if (ageMs(pairing.createdAt) > this.config.pairingTtlSeconds * 1000) {
      this.devices.markPairingStatus(pairing.id, 'expired');
      throw notFound('Pairing code has expired');
    }
    const name = input.name.replace(CONTROL_CHARS, '').trim().slice(0, 64);
    if (name.length < 2) throw badRequest('Device name must be at least 2 characters');

    // Increment before provisioning so concurrent double-confirm requests cannot
    // both create a device.
    const claimed = this.db
      .prepare(
        `UPDATE pairing_challenges SET attempts = attempts + 1
         WHERE id = ? AND status = 'pending' AND attempts < ?`,
      )
      .run(pairing.id, this.config.pairingMaxAttempts);
    if (Number(claimed.changes) !== 1) {
      throw conflict('Pairing code is no longer available');
    }

    const timestamp = nowIso();
    const deviceUuid = newId();
    const device = this.devices.createDevice({
      name,
      model: pairing.model,
      deviceUuid,
      credentialHash: pairing.secretHash,
      ipAddress: pairing.ipAddress,
      appVersion: pairing.appVersion,
      playbackJson: JSON.stringify({ ...EMPTY_PLAYBACK, updatedAt: timestamp }),
      capabilitiesJson: JSON.stringify(DEFAULT_CAPABILITIES),
      storageJson: JSON.stringify({ freeBytes: null, totalBytes: null }),
    });
    this.devices.markPairingPaired(pairing.id, device.id);
    this.ops.addDeviceLog(device.id, 'device.paired', {
      pairingId: pairing.id,
      model: pairing.model,
      actor: input.actor,
    });
    this.ops.addAudit({
      actor: input.actor,
      action: 'device.paired',
      entityType: 'device',
      entityId: device.id,
      payload: { name, model: pairing.model, ipAddress: pairing.ipAddress },
    });
    this.cloud.queueDevice(device);
    this.hub.broadcast({ kind: 'device.updated', device: this.deviceDto(device.id) });
    this.hub.broadcast({
      kind: 'pairing.resolved',
      requestId: pairing.id,
      deviceId: device.id,
    });
    return this.toDto(this.devices.getPairingById(pairing.id) ?? pairing);
  }

  listPending(): PairingRequestDto[] {
    this.devices.expirePairings();
    return this.devices.listPendingPairings().map((pairing) => this.toDto(pairing));
  }

  cancel(pairingId: string, actor: string): void {
    const pairing = this.devices.getPairingById(pairingId);
    if (!pairing) throw notFound('Pairing session not found');
    if (pairing.status !== 'pending') throw conflict('Pairing session is already resolved');
    this.devices.markPairingStatus(pairing.id, 'cancelled');
    this.ops.addAudit({
      actor,
      action: 'pairing.cancelled',
      entityType: 'pairing',
      entityId: pairing.id,
      payload: {},
    });
    this.hub.broadcast({ kind: 'pairing.resolved', requestId: pairing.id, deviceId: null });
  }

  async qrForPairing(
    pairingId: string,
  ): Promise<{ dataUrl: string; deepLink: string; expiresAt: string }> {
    const pairing = this.devices.getPairingById(pairingId);
    if (!pairing || pairing.status !== 'pending') throw notFound('Pairing session not found');
    const deepLink = `${this.adminUrl.replace(/\/+$/, '')}/pair?code=${pairing.code}`;
    const dataUrl = await toDataURL(deepLink, {
      width: 320,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#e6edf7', light: '#0b0f16' },
    });
    return { dataUrl, deepLink, expiresAt: pairing.expiresAt };
  }

  /** Verifies a Quest-presented secret against the stored SHA-256 credential. */
  verifyDeviceSecret(deviceId: string, presentedSecret: string): boolean {
    const stored = this.devices.getCredentialHash(deviceId);
    if (!stored) return false;
    return safeEqualHex(stored, sha256Hex(presentedSecret));
  }

  expirePending(): void {
    this.devices.expirePairings();
  }

  private toDto(pairing: PairingRecord): PairingRequestDto {
    return {
      id: pairing.id,
      code: pairing.code,
      deviceModel: pairing.model,
      appVersion: pairing.appVersion,
      ipAddress: pairing.ipAddress,
      createdAt: pairing.createdAt,
      expiresAt: pairing.expiresAt,
      expiresInSeconds: Math.max(
        0,
        Math.floor((Date.parse(pairing.expiresAt) - Date.now()) / 1000),
      ),
      status: pairing.status,
    };
  }

  private deviceDto(deviceId: string): import('@vrcc/shared-types').DeviceSnapshot {
    const device = this.devices.getDevice(deviceId);
    if (!device) throw notFound('Device not found');
    return {
      id: device.id,
      deviceUuid: device.deviceUuid,
      name: device.name,
      model: device.model,
      status: device.status,
      online: false,
      ipAddress: device.ipAddress,
      appVersion: device.appVersion,
      batteryLevel: device.batteryLevel,
      charging: device.charging,
      lastSeenAt: device.lastSeenAt,
      pairedAt: device.pairedAt,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
      playback: device.playback,
      capabilities: device.capabilities,
      storage: device.storage,
      previewActive: false,
      lastConnectionError: device.lastConnectionError,
      videoCount: device.videoCount,
    };
  }
}
