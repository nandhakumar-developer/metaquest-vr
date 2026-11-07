import type { CloudStatus } from '@vrcc/shared-types';
import type { AdminHub } from '../websocket/hub.js';

/**
 * Local-only cloud status provider.
 *
 * This deployment never contacts an external service. The gateway keeps the
 * dashboard's "Cloud sync" indicator working by always reporting a disabled,
 * local-only state, and the queue helpers below are intentional no-ops kept for
 * the operational services that still notify status changes.
 */
export class CloudSyncService {
  private lastBroadcast = '';

  constructor(private readonly hub: AdminHub) {}

  get enabled(): boolean {
    return false;
  }

  status(): CloudStatus {
    return {
      configured: false,
      online: false,
      lastSyncAt: null,
      lastError: null,
      pendingChanges: 0,
      storageBackend: 'local',
    };
  }

  broadcastStatus(force = false): void {
    const status = this.status();
    const serialized = JSON.stringify(status);
    if (!force && serialized === this.lastBroadcast) return;
    this.lastBroadcast = serialized;
    this.hub.broadcast({ kind: 'cloud.status', cloud: status });
  }

  start(): void {
    this.broadcastStatus(true);
  }

  stop(): void {
    // Nothing to stop in local-only mode.
  }

  async checkNow(): Promise<boolean> {
    return false;
  }

  async syncNow(): Promise<void> {
    // Local-only mode has no remote destination.
  }

  /* -------------------------- Queue helpers ------------------------------- */

  queueDevice(..._args: unknown[]): void {}
  queueDeviceDelete(..._args: unknown[]): void {}
  queueVideo(..._args: unknown[]): void {}
  queueVideoDelete(..._args: unknown[]): void {}
  queueSession(..._args: unknown[]): void {}
  queueCommand(..._args: unknown[]): void {}
  queueLog(..._args: unknown[]): void {}
  queueDeployment(..._args: unknown[]): void {}
  queueSessionDto(..._args: unknown[]): void {}
  queueCommandDto(..._args: unknown[]): void {}
  queueLogDto(..._args: unknown[]): void {}
}
