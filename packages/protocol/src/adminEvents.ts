import {
  type AppSettings,
  type CloudStatus,
  type CommandDto,
  type DeploymentDto,
  type DeviceLogDto,
  type DeviceSnapshot,
  type PairingRequestDto,
  type PlaybackSessionDto,
  type VideoDto,
  type Quaternion,
  type GroupPlaybackState,
} from '@vrcc/shared-types';
import { PROTOCOL_VERSION } from './constants.js';

export interface AdminSnapshot {
  devices: DeviceSnapshot[];
  videos: VideoDto[];
  deployments: DeploymentDto[];
  pairingRequests: PairingRequestDto[];
  commands: CommandDto[];
  group: GroupPlaybackState;
  settings: AppSettings;
  cloud: CloudStatus;
}

/** Server -> admin browser events over the authenticated WebSocket. */
export type AdminServerEvent =
  | {
      kind: 'hello';
      protocolVersion: typeof PROTOCOL_VERSION;
      serverTime: string;
      snapshot: AdminSnapshot;
    }
  | { kind: 'device.updated'; device: DeviceSnapshot }
  | { kind: 'device.removed'; deviceId: string }
  | { kind: 'video.updated'; video: VideoDto }
  | { kind: 'video.removed'; videoId: string }
  | { kind: 'deployment.updated'; deployment: DeploymentDto }
  | { kind: 'command.updated'; command: CommandDto }
  | { kind: 'pairing.pending'; request: PairingRequestDto }
  | { kind: 'pairing.resolved'; requestId: string; deviceId: string | null }
  | {
      kind: 'preview.frame';
      deviceId: string;
      mimeType: 'image/jpeg';
      dataBase64: string;
      width: number;
      height: number;
      capturedAt: string;
      includesUserInterface: boolean;
    }
  | {
      kind: 'preview.headPose';
      deviceId: string;
      rotation: Quaternion;
      sampleTimestamp: string;
    }
  | { kind: 'preview.stopped'; deviceId: string }
  | { kind: 'cloud.status'; cloud: CloudStatus }
  | { kind: 'settings.updated'; settings: AppSettings }
  | { kind: 'session.updated'; session: PlaybackSessionDto }
  | { kind: 'group.updated'; group: GroupPlaybackState }
  | { kind: 'log.created'; log: DeviceLogDto }
  | { kind: 'gateway.ping'; serverTime: string }
  | { kind: 'gateway.error'; message: string };

/** Client -> gateway over the admin socket (kept deliberately tiny). */
export type AdminClientEvent = { kind: 'ping' } | { kind: 'pong' };

const ADMIN_EVENT_KINDS = new Set<AdminServerEvent['kind']>([
  'hello',
  'device.updated',
  'device.removed',
  'video.updated',
  'video.removed',
  'deployment.updated',
  'command.updated',
  'pairing.pending',
  'pairing.resolved',
  'preview.frame',
  'preview.headPose',
  'preview.stopped',
  'cloud.status',
  'settings.updated',
  'session.updated',
  'group.updated',
  'log.created',
  'gateway.ping',
  'gateway.error',
]);

/**
 * Lightweight runtime guard for admin events. The gateway is trusted and
 * same-origin; message schemas from devices are strict, while admin events are
 * guarded by kind and consumed as typed values by the dashboard.
 */
export function parseAdminEvent(raw: string): AdminServerEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const kind = (value as { kind?: unknown }).kind;
    if (typeof kind !== 'string' || !ADMIN_EVENT_KINDS.has(kind as AdminServerEvent['kind'])) {
      return null;
    }
    return value as AdminServerEvent;
  } catch {
    return null;
  }
}

export function isAdminSnapshot(value: unknown): value is AdminSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const snapshot = value as Partial<AdminSnapshot>;
  return (
    Array.isArray(snapshot.devices) &&
    Array.isArray(snapshot.videos) &&
    Array.isArray(snapshot.deployments) &&
    Array.isArray(snapshot.pairingRequests) &&
    Array.isArray(snapshot.commands) &&
    typeof snapshot.group === 'object' &&
    snapshot.group !== null &&
    typeof snapshot.settings === 'object' &&
    snapshot.settings !== null &&
    typeof snapshot.cloud === 'object' &&
    snapshot.cloud !== null
  );
}
