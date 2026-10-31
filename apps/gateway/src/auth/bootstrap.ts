import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomToken } from '../utils/ids.js';
import { safeEqualString } from './password.js';
import type { AdminRepository } from '../database/adminRepo.js';

export interface BootstrapStatus {
  needsBootstrap: boolean;
  tokenFileName: string;
  instructions: string;
}

/**
 * First-run administrator provisioning.
 *
 * The gateway generates a random one-time setup token, prints it to the console
 * and writes it to a 0600 file inside the local data directory. The browser
 * setup form requires it. There is no default password and no unauthenticated
 * administrator creation endpoint.
 */
export class BootstrapService {
  private token: string | null = null;
  private readonly tokenFile: string;

  constructor(
    private readonly admins: AdminRepository,
    dataDir: string,
  ) {
    this.tokenFile = path.join(dataDir, 'bootstrap-token.txt');
    if (this.admins.countAdmins() === 0) {
      this.rotate();
    } else if (existsSync(this.tokenFile)) {
      try {
        unlinkSync(this.tokenFile);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  private rotate(): void {
    this.token = randomToken(24);
    try {
      writeFileSync(this.tokenFile, `${this.token}\n`, { mode: 0o600, encoding: 'utf8' });
    } catch {
      // The console output below is still sufficient for an operator.
    }
    // Intentionally not logged via structured logger: printed by index.ts banner.
    process.stdout.write(
      `\n[VRCC] First-run setup token: ${this.token}\n` +
        `[VRCC] Open http://localhost:3000/setup and enter this token to create the administrator.\n` +
        `[VRCC] Token file: ${this.tokenFile}\n\n`,
    );
  }

  status(): BootstrapStatus {
    return {
      needsBootstrap: this.admins.countAdmins() === 0,
      tokenFileName: path.basename(this.tokenFile),
      instructions:
        'Create the first administrator. Enter the one-time setup token printed in the gateway console or stored in the local data directory.',
    };
  }

  get activeToken(): string | null {
    return this.admins.countAdmins() === 0 ? this.token : null;
  }

  verify(token: string): boolean {
    if (this.admins.countAdmins() > 0) return false;
    if (!this.token) return false;
    return safeEqualString(token.trim(), this.token);
  }

  complete(): void {
    this.token = null;
    try {
      if (existsSync(this.tokenFile)) unlinkSync(this.tokenFile);
    } catch {
      // Best-effort cleanup.
    }
  }

  /** Used by tests and the CLI provisioning path. */
  get tokenPath(): string {
    return this.tokenFile;
  }

  /** For tests that instantiate a pre-seeded database. */
  static readTokenFromFile(filePath: string): string | null {
    if (!existsSync(filePath)) return null;
    try {
      return readFileSync(filePath, 'utf8').trim() || null;
    } catch {
      return null;
    }
  }
}
