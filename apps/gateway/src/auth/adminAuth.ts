import type { AdminIdentity } from '@vrcc/shared-types';
import type { AdminRepository } from '../database/adminRepo.js';
import type { OpsRepository } from '../database/opsRepo.js';
import type { AdminRecord } from '../database/types.js';
import type { GatewayConfig } from '../config.js';
import { conflict, forbidden, tooManyRequests, unauthorized } from '../utils/errors.js';
import { isExpired } from '../utils/time.js';
import { BootstrapService } from './bootstrap.js';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from './password.js';
import { AdminSessionService, type AuthenticatedAdmin, type SessionCreation } from './sessions.js';
import { SupabaseAuthService } from './supabaseAuth.js';
import { WsTicketService } from './wsTickets.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface AuthAttemptWindow {
  count: number;
  resetAt: number;
}

export interface LoginResult extends SessionCreation {
  identity: AdminIdentity;
}

export class AdminAuthService {
  readonly sessions: AdminSessionService;
  readonly supabase: SupabaseAuthService;
  readonly tickets: WsTicketService;
  private readonly attempts = new Map<string, AuthAttemptWindow>();

  constructor(
    private readonly admins: AdminRepository,
    private readonly ops: OpsRepository,
    readonly bootstrap: BootstrapService,
    config: GatewayConfig,
    secureCookies: boolean,
  ) {
    this.sessions = new AdminSessionService(admins, config.adminSessionTtlHours, secureCookies);
    this.supabase = new SupabaseAuthService(config.supabase);
    this.tickets = new WsTicketService();
  }

  needsBootstrap(): boolean {
    return this.admins.countAdmins() === 0;
  }

  private checkAttemptLimit(key: string, max: number, windowMs: number): void {
    const now = Date.now();
    const window = this.attempts.get(key);
    if (!window || window.resetAt <= now) {
      this.attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    window.count += 1;
    if (window.count > max) throw tooManyRequests('Too many attempts. Try again later.');
  }

  private clearAttempts(key: string): void {
    this.attempts.delete(key);
  }

  async bootstrapAdmin(input: {
    email: string;
    password: string;
    displayName: string;
    token: string;
    ip: string;
  }): Promise<LoginResult> {
    if (!this.needsBootstrap()) {
      throw conflict('An administrator already exists');
    }
    this.checkAttemptLimit(`bootstrap:${input.ip}`, 5, 10 * 60_000);
    if (!EMAIL_RE.test(input.email)) throw conflict('Enter a valid email address');
    const issues = validatePasswordStrength(input.password);
    if (issues.length > 0) throw conflict(issues.join('. '));
    if (!this.bootstrap.verify(input.token)) {
      throw forbidden('Invalid or expired setup token');
    }
    const passwordHash = await hashPassword(input.password);
    const admin = this.admins.createAdmin({
      email: input.email,
      displayName: input.displayName.trim() || input.email,
      passwordHash,
      role: 'admin',
    });
    this.bootstrap.complete();
    this.ops.addAudit({
      actor: admin.email,
      action: 'admin.bootstrap',
      entityType: 'admin',
      entityId: admin.id,
      payload: { ip: input.ip },
    });
    return this.finishLogin(admin, 'local', input.ip);
  }

  async login(input: { email: string; password: string; ip: string }): Promise<LoginResult> {
    this.checkAttemptLimit(`login:${input.ip}`, 12, 5 * 60_000);
    const admin = this.admins.getAdminByEmail(input.email);
    if (!admin) {
      // Spend comparable CPU for unknown emails to reduce account enumeration.
      await hashPassword(input.password);
      throw unauthorized('Invalid email or password');
    }
    if (admin.lockedUntil && !isExpired(admin.lockedUntil)) {
      throw tooManyRequests('This account is temporarily locked. Try again later.');
    }
    const verification = await verifyPassword(input.password, admin.passwordHash);
    if (!verification.valid) {
      this.admins.recordFailedLogin(admin.id);
      this.ops.addAudit({
        actor: admin.email,
        action: 'admin.login_failed',
        entityType: 'admin',
        entityId: admin.id,
        payload: { ip: input.ip },
      });
      throw unauthorized('Invalid email or password');
    }
    this.admins.resetFailedLogins(admin.id);
    this.clearAttempts(`login:${input.ip}`);
    if (verification.needsRehash) {
      this.admins.updatePassword(admin.id, await hashPassword(input.password));
    }
    return this.finishLogin(admin, 'local', input.ip);
  }

  async exchangeSupabaseToken(accessToken: string, ip: string): Promise<LoginResult> {
    const verified = await this.supabase.verifyAccessToken(accessToken);
    if (verified.role !== 'admin' && verified.role !== 'operator') {
      throw forbidden('Viewer accounts cannot control devices');
    }
    let admin = this.admins.getAdminByEmail(verified.email);
    if (!admin) {
      admin = this.admins.createAdmin({
        email: verified.email,
        displayName: verified.displayName,
        // Deliberately unusable local password; this identity is Supabase-only.
        passwordHash: '!supabase-only!',
        role: verified.role,
      });
    } else if (admin.displayName !== verified.displayName) {
      this.admins.updateProfile(admin.id, verified.displayName);
    }
    return this.finishLogin(admin, 'supabase', ip);
  }

  private finishLogin(admin: AdminRecord, source: 'local' | 'supabase', ip: string): LoginResult {
    const session = this.sessions.createSession(admin, source);
    this.ops.addAudit({
      actor: admin.email,
      action: 'admin.login',
      entityType: 'admin',
      entityId: admin.id,
      payload: { ip, source },
    });
    return { ...session, identity: session.identity };
  }

  async changePassword(
    authenticated: AuthenticatedAdmin,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const verification = await verifyPassword(currentPassword, authenticated.admin.passwordHash);
    if (!verification.valid) throw unauthorized('Current password is incorrect');
    const issues = validatePasswordStrength(newPassword);
    if (issues.length > 0) throw conflict(issues.join('. '));
    this.admins.updatePassword(
      authenticated.admin.id,
      await hashPassword(newPassword),
    );
    // Invalidate every other session, keep the current one alive.
    this.admins.deleteOtherSessionsForAdmin(authenticated.admin.id, authenticated.session.id);
    this.ops.addAudit({
      actor: authenticated.admin.email,
      action: 'admin.password_changed',
      entityType: 'admin',
      entityId: authenticated.admin.id,
      payload: {},
    });
  }

  async issueWsTicket(
    authenticated: AuthenticatedAdmin,
  ): Promise<{ ticket: string; expiresAt: string }> {
    return this.tickets.issue(authenticated);
  }
}
