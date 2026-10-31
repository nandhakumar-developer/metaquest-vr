import {
  adminCommandSchema,
  makeMessage,
  type AdminCommand,
} from '@vrcc/protocol';
import type { CommandDto, CommandType } from '@vrcc/shared-types';
import type { GatewayConfig } from '../config.js';
import type { CommandRecord } from '../database/types.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { DeviceRegistry } from '../devices/registry.js';
import type { DeviceStateService } from '../devices/stateService.js';
import type { AdminHub } from '../websocket/hub.js';
import type { CloudSyncService } from '../services/cloudSync.js';
import { AppError, badRequest, conflict, notFound } from '../utils/errors.js';
import { newId } from '../utils/ids.js';
import { nowIso } from '../utils/time.js';

interface PendingCommand {
  commandId: string;
  deviceId: string;
  type: CommandType;
  resolve: (command: CommandDto) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export function toCommandDto(record: CommandRecord & { deviceName: string }): CommandDto {
  return {
    id: record.id,
    deviceId: record.deviceId,
    deviceName: record.deviceName,
    type: record.commandType,
    payload: record.payload,
    status: record.status,
    requestedBy: record.requestedBy,
    requestedAt: record.requestedAt,
    acknowledgedAt: record.acknowledgedAt,
    errorMessage: record.errorMessage,
  };
}

/**
 * Routes one admin command to exactly one authenticated device connection.
 * There is deliberately no broadcast path here.
 */
export class CommandService {
  private readonly pending = new Map<string, PendingCommand>();

  constructor(
    private readonly config: GatewayConfig,
    private readonly ops: OpsRepository,
    private readonly devices: DeviceRepository,
    private readonly registry: DeviceRegistry,
    private readonly state: DeviceStateService,
    private readonly hub: AdminHub,
    private readonly cloud: CloudSyncService,
  ) {}

  async execute(input: {
    deviceId: string;
    type: CommandType;
    payload: Record<string, unknown>;
    actor: string;
  }): Promise<CommandDto> {
    const device = this.devices.getDevice(input.deviceId);
    if (!device) throw notFound('Device not found');
    if (device.status === 'revoked') {
      throw conflict('Device has been unpaired; pair it again before sending commands');
    }
    const connection = this.registry.get(device.id);
    if (!connection || connection.socket.readyState !== 1) {
      throw conflict('Device is offline. Reconnect it before sending commands.');
    }

    const commandId = newId();
    const timestamp = nowIso();
    const candidate = {
      protocolVersion: 1,
      messageId: commandId,
      type: input.type,
      deviceId: device.deviceUuid,
      timestamp,
      payload: input.payload,
    };
    const parsed = adminCommandSchema.safeParse(candidate);
    if (!parsed.success) {
      throw badRequest('Invalid command payload', {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    const command = parsed.data as AdminCommand;

    this.ops.insertCommand({
      id: commandId,
      deviceId: device.id,
      commandType: command.type,
      payload: command.payload as Record<string, unknown>,
      requestedBy: input.actor,
    });
    this.ops.addAudit({
      actor: input.actor,
      action: `command.${command.type}`,
      entityType: 'device',
      entityId: device.id,
      payload: { commandId, payload: command.payload },
    });
    this.state.logEvent(device.id, 'command.requested', {
      commandId,
      type: command.type,
      actor: input.actor,
    });

    const wire = JSON.stringify(makeMessage(command.type, device.deviceUuid, command.payload, commandId, timestamp));

    const result = await new Promise<CommandDto>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.finishFailure(
          commandId,
          'timeout',
          'Timed out waiting for the device to acknowledge the command',
          new AppError(504, 'COMMAND_TIMEOUT', 'Device did not acknowledge the command in time', {
            commandId,
          }),
        );
      }, this.config.commandTimeoutMs);
      timer.unref?.();
      this.pending.set(commandId, {
        commandId,
        deviceId: device.id,
        type: command.type,
        resolve,
        reject,
        timer,
      });

      const sent = this.registry.send(device.id, wire);
      if (!sent) {
        clearTimeout(timer);
        this.pending.delete(commandId);
        this.updateStatus(commandId, 'failed', 'Device connection closed before the command was sent');
        reject(new AppError(503, 'DEVICE_UNAVAILABLE', 'Device connection closed before the command was sent'));
        return;
      }
    });

    return result;
  }

  handleAck(
    deviceId: string,
    payload: { commandId: string; success: boolean; detail?: string },
  ): void {
    const pending = this.pending.get(payload.commandId);
    if (!pending || pending.deviceId !== deviceId) return;
    clearTimeout(pending.timer);
    this.pending.delete(payload.commandId);
    if (payload.success) {
      this.updateStatus(payload.commandId, 'acknowledged', null);
      const record = this.ops.getCommand(payload.commandId);
      if (record) {
        pending.resolve(toCommandDto(record));
        this.state.logEvent(deviceId, 'command.acknowledged', {
          commandId: payload.commandId,
          type: pending.type,
        });
      } else {
        pending.reject(new Error('Command record missing'));
      }
    } else {
      this.updateStatus(payload.commandId, 'failed', payload.detail ?? 'Device rejected the command');
      const message = payload.detail ?? 'Device rejected the command';
      this.state.logEvent(deviceId, 'command.rejected', {
        commandId: payload.commandId,
        type: pending.type,
        detail: message,
      });
      pending.reject(
        new AppError(502, 'COMMAND_REJECTED', message, { commandId: payload.commandId }),
      );
    }
  }

  handleError(
    deviceId: string,
    payload: { commandId: string; code: string; message: string; retryable?: boolean },
  ): void {
    const pending = this.pending.get(payload.commandId);
    if (!pending || pending.deviceId !== deviceId) return;
    clearTimeout(pending.timer);
    this.pending.delete(payload.commandId);
    const message = `${payload.code}: ${payload.message}`;
    this.updateStatus(payload.commandId, 'failed', message);
    this.state.logEvent(deviceId, 'command.error', {
      commandId: payload.commandId,
      type: pending.type,
      code: payload.code,
      retryable: payload.retryable ?? false,
    });
    pending.reject(
      new AppError(502, 'COMMAND_FAILED', message, { commandId: payload.commandId }),
    );
  }

  failPendingForDevice(deviceId: string, reason: string): void {
    for (const pending of [...this.pending.values()]) {
      if (pending.deviceId !== deviceId) continue;
      clearTimeout(pending.timer);
      this.pending.delete(pending.commandId);
      this.updateStatus(pending.commandId, 'failed', reason);
      pending.reject(new AppError(503, 'DEVICE_DISCONNECTED', reason, {
        commandId: pending.commandId,
      }));
    }
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private finishFailure(
    commandId: string,
    status: 'timeout' | 'failed',
    message: string,
    error: Error,
  ): void {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(commandId);
    this.updateStatus(commandId, status, message);
    this.state.logEvent(pending.deviceId, `command.${status}`, {
      commandId,
      type: pending.type,
    });
    this.ops.addAudit({
      actor: 'system',
      action: `command.${status}`,
      entityType: 'device',
      entityId: pending.deviceId,
      payload: { commandId, message },
    });
    pending.reject(error);
  }

  private updateStatus(
    commandId: string,
    status: 'acknowledged' | 'failed' | 'timeout',
    errorMessage: string | null,
  ): void {
    this.ops.updateCommandStatus(commandId, status, errorMessage);
    const record = this.ops.getCommand(commandId);
    if (record) {
      this.cloud.queueCommand(record);
      this.broadcast(toCommandDto(record));
    }
  }

  private broadcast(command: CommandDto): void {
    this.hub.broadcast({ kind: 'command.updated', command });
  }

  async getHistory(input: {
    deviceId?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: CommandDto[]; page: number; pageSize: number; total: number }> {
    const page = this.ops.listCommands(input);
    return {
      ...page,
      items: page.items.map(toCommandDto),
    };
  }

  /** Explicit multi-target helper for future group controls. */
  async executeForDevices(input: {
    deviceIds: string[];
    type: CommandType;
    payload: Record<string, unknown>;
    actor: string;
  }): Promise<Array<{ deviceId: string; command?: CommandDto; error?: string }>> {
    const unique = [...new Set(input.deviceIds)];
    if (unique.length === 0) throw badRequest('At least one device is required');
    if (unique.length > 64) throw badRequest('Too many devices in one group command');
    const results = await Promise.all(
      unique.map(async (deviceId) => {
        try {
          const command = await this.execute({
            deviceId,
            type: input.type,
            payload: input.payload,
            actor: input.actor,
          });
          return { deviceId, command };
        } catch (error) {
          return {
            deviceId,
            error: error instanceof AppError ? error.message : 'Command failed',
          };
        }
      }),
    );
    return results;
  }
}
