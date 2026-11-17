import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomToken } from '../utils/ids.js';
import { hashPassword, safeEqualString, validatePasswordStrength } from './password.js';
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
        `[VRCC] Open the dashboard setup page (/setup) and enter this token to create the administrator.\n` +
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

export interface ConfiguredAdminInput {
  email: string;
  password: string;
  displayName?: string;
  enabled: boolean;
}

/**
 * Provisions the administrator declared in `.env` when the local database does
 * not contain that account yet. This makes a fresh clone usable after only
 * `npm install` and a `.env` file: no manual setup token step is required.
 *
 * Existing accounts are never modified here, so password changes made through
 * the dashboard survive a restart. `npm run admin:create` remains the explicit
 * way to reset a password.
 */
export async function ensureConfiguredAdmin(
  admins: AdminRepository,
  input: ConfiguredAdminInput,
): Promise<'created' | 'existing' | 'skipped'> {
  if (!input.enabled) return 'skipped';

  const email = input.email.trim();
  const password = input.password;
  if (!email || !password) return 'skipped';

  const existing = admins.getAdminByEmail(email);
  if (existing) {
    // A failed-login lock from an earlier run must not block the hardcoded
    // credentials after a restart.
    admins.resetFailedLogins(existing.id);
    return 'existing';
  }

  const issues = validatePasswordStrength(password);
  if (issues.length > 0) {
    process.stderr.write(
      `[VRCC] Ignoring BOOTSTRAP_ADMIN_* credentials: ${issues.join('. ')}\n`,
    );
    return 'skipped';
  }

  const passwordHash = await hashPassword(password);
  const admin = admins.createAdmin({
    email,
    displayName: input.displayName?.trim() || email,
    passwordHash,
    role: 'admin',
  });
  process.stdout.write(
    `[VRCC] Provisioned administrator "${admin.email}" from environment configuration.\n`,
  );
  return 'created';
}
