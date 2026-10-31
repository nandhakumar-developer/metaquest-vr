import type { WebSocket } from 'ws';
import { WS_CLOSE_CODES } from '@vrcc/protocol';

export interface DeviceConnection {
  deviceId: string;
  deviceUuid: string;
  ipAddress: string | null;
  socket: WebSocket;
  connectedAt: number;
  lastHeartbeatAt: number;
  previewActive: boolean;
  previewStartedAt: number | null;
  lastPreviewFrameAt: number;
  authenticated: boolean;
}

/**
 * Authoritative source for live device connections. Independent per-device
 * sockets; this registry never fans a device command out to other devices.
 */
export class DeviceRegistry {
  private readonly byDeviceId = new Map<string, DeviceConnection>();
  private readonly byDeviceUuid = new Map<string, DeviceConnection>();

  attach(input: Omit<DeviceConnection, 'connectedAt' | 'lastHeartbeatAt' | 'previewActive' | 'previewStartedAt' | 'lastPreviewFrameAt' | 'authenticated'>): DeviceConnection {
    const existing = this.byDeviceId.get(input.deviceId);
    if (existing && existing.socket !== input.socket) {
      try {
        existing.socket.close(WS_CLOSE_CODES.replaced, 'Replaced by a newer connection');
      } catch {
        // Ignore.
      }
      this.detach(existing.deviceId, existing.socket);
    }
    const connection: DeviceConnection = {
      ...input,
      connectedAt: Date.now(),
      lastHeartbeatAt: Date.now(),
      previewActive: false,
      previewStartedAt: null,
      lastPreviewFrameAt: 0,
      authenticated: true,
    };
    this.byDeviceId.set(connection.deviceId, connection);
    this.byDeviceUuid.set(connection.deviceUuid, connection);
    return connection;
  }

  detach(deviceId: string, socket?: WebSocket): boolean {
    const connection = this.byDeviceId.get(deviceId);
    if (!connection) return false;
    if (socket && connection.socket !== socket) return false;
    this.byDeviceId.delete(deviceId);
    this.byDeviceUuid.delete(connection.deviceUuid);
    return true;
  }

  get(deviceId: string): DeviceConnection | null {
    return this.byDeviceId.get(deviceId) ?? null;
  }

  getByUuid(deviceUuid: string): DeviceConnection | null {
    return this.byDeviceUuid.get(deviceUuid) ?? null;
  }

  isConnected(deviceId: string): boolean {
    const connection = this.byDeviceId.get(deviceId);
    return Boolean(connection && connection.socket.readyState === 1);
  }

  touch(deviceId: string): void {
    const connection = this.byDeviceId.get(deviceId);
    if (connection) connection.lastHeartbeatAt = Date.now();
  }

  setPreview(deviceId: string, active: boolean): void {
    const connection = this.byDeviceId.get(deviceId);
    if (!connection) return;
    connection.previewActive = active;
    connection.previewStartedAt = active ? Date.now() : null;
    if (!active) connection.lastPreviewFrameAt = 0;
  }

  send(deviceId: string, payload: string): boolean {
    const connection = this.byDeviceId.get(deviceId);
    if (!connection || connection.socket.readyState !== 1) return false;
    try {
      connection.socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  list(): DeviceConnection[] {
    return [...this.byDeviceId.values()];
  }

  staleConnections(thresholdMs: number): DeviceConnection[] {
    const threshold = Date.now() - thresholdMs;
    return this.list().filter((connection) => connection.lastHeartbeatAt < threshold);
  }

  closeAll(code: number, reason: string): void {
    for (const connection of this.list()) {
      try {
        connection.socket.close(code, reason);
      } catch {
        // Ignore.
      }
    }
    this.byDeviceId.clear();
    this.byDeviceUuid.clear();
  }
}
