import type { FastifyBaseLogger } from 'fastify';
import type { GatewayConfig } from '../config.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { DeviceRepository } from '../database/deviceRepo.js';
import type { PairingService } from '../pairing/service.js';

/** Periodic pairing expiry and retention pruning. */
export class MaintenanceService {
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: GatewayConfig,
    private readonly ops: OpsRepository,
    private readonly devices: DeviceRepository,
    private readonly pairing: PairingService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  start(): void {
    this.pairing.expirePending();
    this.prune();
    const pairingTimer = setInterval(() => this.pairing.expirePending(), 10_000);
    const pruneTimer = setInterval(() => this.prune(), 60 * 60_000);
    pairingTimer.unref?.();
    pruneTimer.unref?.();
    this.timers.push(pairingTimer, pruneTimer);
  }

  stop(): void {
    for (const timer of this.timers) clearInterval(timer);
    this.timers.length = 0;
  }

  prune(): void {
    const cutoff = new Date(
      Date.now() - this.config.retentionDays * 24 * 60 * 60_000,
    ).toISOString();
    try {
      const sessions = this.ops.pruneSessions(cutoff);
      const commands = this.ops.pruneCommands(cutoff);
      const pairings = this.devices.prunePairings(cutoff);
      this.ops.pruneLogs(cutoff);
      this.ops.pruneOutbox(cutoff);
      this.logger.info(
        { retentionDays: this.config.retentionDays, sessions, commands, pairings },
        'Retention pruning complete',
      );
    } catch (error) {
      this.logger.warn({ err: error }, 'Retention pruning failed');
    }
  }
}
