import type { IncomingMessage } from 'node:http';
import { type WebSocket } from 'ws';
import {
  makeMessage,
  parseQuestMessage,
  PROTOCOL_VERSION,
  WS_CLOSE_CODES,
  type DeviceCommandMessage,
  type QuestMessage,
} from '@vrcc/protocol';
import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { DeviceRecord } from '../database/types.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { CommandService } from '../commands/service.js';
import type { PairingService } from '../pairing/service.js';
import type { PreviewService } from '../preview/service.js';
import type { DeploymentService } from '../transfers/deploymentService.js';
import { newId } from '../utils/ids.js';

const AUTH_TIMEOUT_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 300;
const MESSAGE_WINDOW_MS = 10_000;
const MAX_UNAUTHENTICATED_PER_IP = 5;

interface SocketState {
  device: DeviceRecord | null;
  authTimer: NodeJS.Timeout;
  messagesInWindow: number;
  windowStartedAt: number;
  invalidMessages: number;
}

function normalizeIp(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/^::ffff:/, '');
}

/**
 * One handler per Quest WebSocket. Identity is bound only after DEVICE_AUTH;
 * every subsequent frame must carry the bound device UUID.
 */
export class DeviceSocketHandler {
  private readonly unauthenticatedByIp = new Map<string, number>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly devices: DeviceRepository,
    private readonly registry: DeviceRegistry,
    private readonly state: DeviceStateService,
    private readonly commands: CommandService,
    private readonly pairing: PairingService,
    private readonly preview: PreviewService,
    private readonly deployments: DeploymentService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  handle(socket: WebSocket, request: IncomingMessage): void {
    const ip = normalizeIp(request.socket.remoteAddress);
    const ipKey = ip ?? 'unknown';
    const pending = this.unauthenticatedByIp.get(ipKey) ?? 0;
    if (pending >= MAX_UNAUTHENTICATED_PER_IP) {
      socket.close(WS_CLOSE_CODES.rateLimited, 'Too many connection attempts');
      return;
    }
    this.unauthenticatedByIp.set(ipKey, pending + 1);

    const state: SocketState = {
      device: null,
      authTimer: setTimeout(() => {
        if (!state.device) {
          this.sendAuthError(socket, newId(), 'BAD_CREDENTIAL', 'Authentication timed out');
          socket.close(WS_CLOSE_CODES.unauthorized, 'Authentication timed out');
        }
      }, AUTH_TIMEOUT_MS),
      messagesInWindow: 0,
      windowStartedAt: Date.now(),
      invalidMessages: 0,
    };
    state.authTimer.unref?.();

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(WS_CLOSE_CODES.invalidMessage, 'Binary frames are not supported');
        return;
      }
      if (Date.now() - state.windowStartedAt > MESSAGE_WINDOW_MS) {
        state.messagesInWindow = 0;
        state.windowStartedAt = Date.now();
      }
      state.messagesInWindow += 1;
      if (state.messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
        socket.close(WS_CLOSE_CODES.rateLimited, 'Too many messages');
        return;
      }
      const parsed = parseQuestMessage(data.toString());
      if (!parsed.ok) {
        state.invalidMessages += 1;
        this.logger.warn(
          { ip, error: parsed.error, details: parsed.details },
          'Rejected malformed Quest message',
        );
        this.send(socket, 'PROTOCOL_ERROR', state.device?.deviceUuid ?? newId(), {
          code: 'INVALID_MESSAGE',
          message: parsed.error,
        });
        if (state.invalidMessages >= 5) {
          socket.close(WS_CLOSE_CODES.invalidMessage, 'Too many invalid messages');
        }
        return;
      }
      try {
        if (!state.device) {
          this.handleAuthentication(socket, parsed.data, ip, state);
          return;
        }
        if (parsed.data.deviceId !== state.device.deviceUuid) {
          socket.close(
            WS_CLOSE_CODES.unauthorized,
            'Message device identity does not match the authenticated device',
          );
          return;
        }
        this.registry.touch(state.device.id);
        this.handleAuthenticatedMessage(socket, parsed.data, state.device);
      } catch (error) {
        this.logger.error(
          { err: error, ip, deviceId: state.device?.id },
          'Failed to process Quest message',
        );
        this.send(socket, 'PROTOCOL_ERROR', state.device?.deviceUuid ?? newId(), {
          code: 'INTERNAL_ERROR',
          message: 'The gateway could not process this message',
        });
      }
    });

    socket.on('close', (code, reason) => {
      clearTimeout(state.authTimer);
      const remaining = (this.unauthenticatedByIp.get(ipKey) ?? 1) - 1;
      if (remaining <= 0) this.unauthenticatedByIp.delete(ipKey);
      else this.unauthenticatedByIp.set(ipKey, remaining);

      const device = state.device;
      if (!device) return;
      const detached = this.registry.detach(device.id, socket);
      if (!detached) return;
      const reasonText = reason.toString() || `socket closed (${code})`;
      this.logger.info({ deviceId: device.id, code, reason: reasonText }, 'Device disconnected');
      try {
        this.commands.failPendingForDevice(
          device.id,
          'Device disconnected before acknowledging the command',
        );
        this.preview.onDeviceDisconnected(device.id);
        this.state.onDisconnected(device.id, reasonText);
      } catch (err) {
        // Ignore errors if database or server is already shutting down
        this.logger.debug({ err, deviceId: device.id }, 'Error during socket disconnect cleanup');
      }
    });

    socket.on('error', (error) => {
      this.logger.warn({ err: error, ip }, 'Quest WebSocket error');
    });
  }

  private handleAuthentication(
    socket: WebSocket,
    message: QuestMessage,
    ip: string | null,
    state: SocketState,
  ): void {
    if (message.type !== 'DEVICE_AUTH') {
      this.sendAuthError(
        socket,
        message.deviceId,
        'BAD_CREDENTIAL',
        'First message must be DEVICE_AUTH',
      );
      socket.close(WS_CLOSE_CODES.unauthorized, 'Authentication required');
      return;
    }
    const device = this.devices.getDeviceByUuid(message.deviceId);
    if (!device) {
      this.sendAuthError(socket, message.deviceId, 'UNKNOWN_DEVICE', 'This headset is not paired');
      socket.close(WS_CLOSE_CODES.unauthorized, 'Unknown device');
      return;
    }
    if (device.status === 'revoked' || device.revokedAt) {
      this.sendAuthError(
        socket,
        device.deviceUuid,
        'REVOKED',
        'Device credentials were revoked; pair again from the dashboard',
      );
      socket.close(WS_CLOSE_CODES.unauthorized, 'Device revoked');
      return;
    }
    if (!this.pairing.verifyDeviceSecret(device.id, message.payload.secret)) {
      this.sendAuthError(socket, device.deviceUuid, 'BAD_CREDENTIAL', 'Invalid device credential');
      this.state.logEvent(device.id, 'device.auth_failed', { ip }, true);
      socket.close(WS_CLOSE_CODES.unauthorized, 'Bad credential');
      return;
    }

    clearTimeout(state.authTimer);
    state.device = device;
    this.registry.attach({
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      ipAddress: ip,
      socket,
    });
    const online = this.state.onConnected(device, ip ?? 'unknown');
    this.send(socket, 'AUTH_OK', device.deviceUuid, {
      deviceId: device.id,
      deviceUuid: device.deviceUuid,
      displayName: online.name,
      serverTime: new Date().toISOString(),
      config: {
        heartbeatIntervalMs: this.config.heartbeatIntervalMs,
        previewMaxFps: this.config.previewMaxFps,
        timeoutsMs: this.config.commandTimeoutMs,
      },
    });
    this.state.logEvent(device.id, 'device.authenticated', {
      ip,
      appVersion: message.payload.appVersion,
      protocolVersion: PROTOCOL_VERSION,
    });
    this.send(socket, 'STATUS_REQUEST', device.deviceUuid, {});
    this.deployments.onReconnected(device.id);
    this.logger.info({ deviceId: device.id, ip }, 'Quest device authenticated');
  }

  private handleAuthenticatedMessage(
    socket: WebSocket,
    message: QuestMessage,
    device: DeviceRecord,
  ): void {
    switch (message.type) {
      case 'HEARTBEAT':
        this.state.applyHeartbeat(device.id, message.payload);
        break;
      case 'DEVICE_STATUS':
        this.state.applyHeartbeat(device.id, message.payload, true);
        break;
      case 'DEVICE_REGISTER':
        this.state.applyRegister(device.id, message.payload);
        break;
      case 'PLAYBACK_EVENT':
        this.state.applyPlaybackEvent(device.id, message.payload);
        break;
      case 'VIDEO_INVENTORY':
        this.state.applyInventory(device.id, message.payload.videos);
        break;
      case 'VIDEO_DOWNLOAD_PROGRESS':
        this.deployments.onProgress(device.id, message.payload);
        break;
      case 'VIDEO_READY':
        this.deployments.onReady(device.id, message.payload);
        break;
      case 'COMMAND_ACK':
        this.commands.handleAck(device.id, message.payload);
        break;
      case 'COMMAND_ERROR':
        this.commands.handleError(device.id, message.payload);
        break;
      case 'HEAD_POSE':
        this.preview.handleHeadPose(device.id, message.payload.rotation, message.payload.sampleTimestamp);
        break;
      case 'PREVIEW_SIGNAL':
        this.preview.handleSignal(device.id, message.payload);
        break;
      case 'PING':
        this.send(socket, 'PONG', device.deviceUuid, {
          clientTime: message.payload.clientTime,
          serverTime: new Date().toISOString(),
        });
        break;
      case 'PONG':
        break;
      case 'DEVICE_AUTH':
        this.send(socket, 'PROTOCOL_ERROR', device.deviceUuid, {
          code: 'ALREADY_AUTHENTICATED',
          message: 'Device is already authenticated on this connection',
        });
        break;
      default: {
        const exhaustive: never = message;
        this.logger.warn({ message: exhaustive }, 'Unhandled Quest message type');
      }
    }
  }

  private sendAuthError(
    socket: WebSocket,
    deviceId: string,
    code: 'UNKNOWN_DEVICE' | 'BAD_CREDENTIAL' | 'REVOKED' | 'ALREADY_CONNECTED',
    message: string,
  ): void {
    this.send(socket, 'AUTH_ERROR', deviceId, { code, message });
  }

  private send(
    socket: WebSocket,
    type: DeviceCommandMessage['type'],
    deviceId: string,
    payload: unknown,
  ): void {
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(makeMessage(type, deviceId, payload)));
    } catch (error) {
      this.logger.warn({ err: error }, 'Failed to send WebSocket message to Quest');
    }
  }
}
