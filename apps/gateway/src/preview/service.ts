import type { Quaternion } from '@vrcc/shared-types';
import type { GatewayConfig } from '../config.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { CommandService } from '../commands/service.js';
import type { AdminHub } from '../websocket/hub.js';
import { conflict, notFound, notImplemented } from '../utils/errors.js';

/**
 * Preview is explicitly two separate capabilities:
 *  - "source": gateway-hosted video content (served by HTTP; not a headset view)
 *  - "snapshot": low-rate JPEG frames captured by the Quest app
 *
 * WebRTC headset capture is not implemented; requests return 501 rather than
 * pretending a static image is a live eye view.
 */
export class PreviewService {
  constructor(
    private readonly config: GatewayConfig,
    private readonly devices: DeviceRepository,
    private readonly ops: OpsRepository,
    private readonly registry: DeviceRegistry,
    private readonly commands: CommandService,
    private readonly state: DeviceStateService,
    private readonly hub: AdminHub,
  ) {}

  async start(input: {
    deviceId: string;
    mode: 'snapshot' | 'webrtc';
    actor: string;
  }): Promise<{ mode: 'snapshot'; active: true }> {
    if (input.mode === 'webrtc') {
      throw notImplemented(
        'WebRTC headset-view streaming is not implemented in this release. Use the low-rate headset snapshot preview or the source-video preview.',
      );
    }
    const device = this.devices.getDevice(input.deviceId);
    if (!device) throw notFound('Device not found');
    if (device.status !== 'online' || !this.registry.isConnected(device.id)) {
      throw conflict('Device is offline');
    }
    const connection = this.registry.get(device.id);
    if (!connection) throw conflict('Device is offline');

    this.registry.setPreview(device.id, true);
    try {
      await this.commands.execute({
        deviceId: device.id,
        type: 'REQUEST_PREVIEW',
        payload: { mode: 'snapshot' },
        actor: input.actor,
      });
    } catch (error) {
      this.registry.setPreview(device.id, false);
      throw error;
    }
    this.state.logEvent(device.id, 'preview.started', { mode: 'snapshot', actor: input.actor }, true);
    this.ops.addAudit({
      actor: input.actor,
      action: 'preview.started',
      entityType: 'device',
      entityId: device.id,
      payload: { mode: 'snapshot' },
    });
    this.hub.broadcast({
      kind: 'device.updated',
      device: this.state.toDto(this.devices.getDevice(device.id) ?? device),
    });
    return { mode: 'snapshot', active: true };
  }

  async stop(input: { deviceId: string; actor: string; notifyDevice?: boolean }): Promise<void> {
    const device = this.devices.getDevice(input.deviceId);
    if (!device) throw notFound('Device not found');
    const connection = this.registry.get(device.id);
    const wasActive = connection?.previewActive ?? false;
    this.registry.setPreview(device.id, false);
    if (input.notifyDevice !== false && this.registry.isConnected(device.id)) {
      try {
        await this.commands.execute({
          deviceId: device.id,
          type: 'STOP_PREVIEW',
          payload: {},
          actor: input.actor,
        });
      } catch {
        // Preview must still be considered stopped if the device does not ack;
        // the next reconnect clears it on the headset.
      }
    }
    if (wasActive) {
      this.state.logEvent(device.id, 'preview.stopped', { actor: input.actor }, true);
      this.ops.addAudit({
        actor: input.actor,
        action: 'preview.stopped',
        entityType: 'device',
        entityId: device.id,
        payload: {},
      });
    }
    this.hub.broadcast({ kind: 'preview.stopped', deviceId: device.id });
    this.hub.broadcast({
      kind: 'device.updated',
      device: this.state.toDto(this.devices.getDevice(device.id) ?? device),
    });
  }

  handleSignal(
    deviceId: string,
    payload: {
      mimeType: 'image/jpeg';
      dataBase64: string;
      width: number;
      height: number;
      capturedAt: string;
      includesUserInterface: boolean;
    },
  ): void {
    const connection = this.registry.get(deviceId);
    if (!connection?.previewActive) return;
    const settings = this.ops.getSettings();
    const maxFps = Math.min(this.config.previewMaxFps, settings.previewMaxFps);
    const minInterval = 1000 / Math.max(1, maxFps);
    const now = Date.now();
    if (connection.lastPreviewFrameAt > 0 && now - connection.lastPreviewFrameAt < minInterval) {
      return;
    }
    const byteLength = Math.floor((payload.dataBase64.length * 3) / 4);
    if (byteLength > this.config.previewMaxJpegBytes) {
      this.state.logEvent(deviceId, 'preview.frame_too_large', { byteLength });
      return;
    }
    connection.lastPreviewFrameAt = now;
    this.hub.broadcast({
      kind: 'preview.frame',
      deviceId,
      mimeType: payload.mimeType,
      dataBase64: payload.dataBase64,
      width: payload.width,
      height: payload.height,
      capturedAt: payload.capturedAt,
      includesUserInterface: payload.includesUserInterface,
    });
  }

  handleHeadPose(deviceId: string, rotation: Quaternion, sampleTimestamp: string): void {
    const connection = this.registry.get(deviceId);
    if (!connection?.previewActive) return;
    this.hub.broadcast({
      kind: 'preview.headPose',
      deviceId,
      rotation,
      sampleTimestamp,
    });
  }

  onDeviceDisconnected(deviceId: string): void {
    this.registry.setPreview(deviceId, false);
    this.hub.broadcast({ kind: 'preview.stopped', deviceId });
  }
}
