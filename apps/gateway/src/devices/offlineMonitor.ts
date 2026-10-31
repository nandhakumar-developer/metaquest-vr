import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { DeviceRegistry } from './registry.js';
import type { DeviceStateService } from './stateService.js';
import type { CommandService } from '../commands/service.js';
import type { PreviewService } from '../preview/service.js';

/**
 * Detects silent headset disconnects. Devices are only shown online while they
 * have an authenticated socket and a recent heartbeat.
 */
export class OfflineMonitor {
  private timer: NodeJS.Timeout | null = null;
  private readonly reaping = new Set<string>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly devices: DeviceRepository,
    private readonly registry: DeviceRegistry,
    private readonly state: DeviceStateService,
    private readonly commands: CommandService,
    private readonly preview: PreviewService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start(): void {
    this.reconcileAfterRestart();
    this.timer = setInterval(() => this.check(), 2_000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** No device can still be "online" immediately after a gateway restart. */
  reconcileAfterRestart(): void {
    for (const device of this.devices.listDevices()) {
      if (device.status !== 'online') continue;
      const updated = this.devices.markOffline(device.id, 'Gateway restarted');
      if (updated) {
        this.state.broadcastDevice(updated, true);
        this.logger.info({ deviceId: device.id }, 'Marked stale device offline after restart');
      }
    }
  }

  check(): void {
    for (const connection of this.registry.staleConnections(this.config.offlineThresholdMs)) {
      if (this.reaping.has(connection.deviceId)) continue;
      this.reaping.add(connection.deviceId);
      this.logger.warn(
        {
          deviceId: connection.deviceId,
          lastHeartbeatAgeMs: Date.now() - connection.lastHeartbeatAt,
        },
        'Device heartbeat timed out; marking offline',
      );
      this.commands.failPendingForDevice(
        connection.deviceId,
        'Device stopped responding (heartbeat timeout)',
      );
      this.preview.onDeviceDisconnected(connection.deviceId);
      this.state.onDisconnected(connection.deviceId, 'Heartbeat timeout');
      try {
        connection.socket.close(4008, 'Heartbeat timeout');
      } catch {
        // Ignore.
      }
      const reapTimer = setTimeout(() => {
        const still = this.registry.get(connection.deviceId);
        if (still && still.socket === connection.socket) {
          try {
            connection.socket.terminate();
          } catch {
            // Ignore.
          }
          if (this.registry.detach(connection.deviceId, connection.socket)) {
            this.state.onDisconnected(connection.deviceId, 'Heartbeat timeout');
          }
        }
        this.reaping.delete(connection.deviceId);
      }, 2_000);
      reapTimer.unref?.();
    }
  }
}
