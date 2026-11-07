import type { FastifyReply, FastifyRequest } from 'fastify';
import { randomToken, sha256Hex } from '../utils/ids.js';
import { addSecondsIso, isExpired, nowIso } from '../utils/time.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { safeEqualString } from './password.js';
import type { AdminRepository } from '../database/adminRepo.js';
import type { AdminRecord, AdminSessionRecord, AdminSessionWithAdmin } from '../database/types.js';
import { publicAdminIdentity } from '../database/types.js';
import type { AdminIdentity } from '@vrcc/shared-types';

export const SESSION_COOKIE = 'vrcc_session';
export const CSRF_HEADER = 'x-vrcc-csrf';

export interface AuthenticatedAdmin {
  identity: AdminIdentity;
  session: AdminSessionRecord;
  admin: AdminRecord;
}

export interface SessionCreation {
  token: string;
  csrfToken: string;
  expiresAt: string;
  identity: AdminIdentity;
}

export class AdminSessionService {
  private readonly lastTouch = new Map<string, number>();

  constructor(
    private readonly admins: AdminRepository,
    private readonly ttlHours: number,
    private readonly secureCookies: boolean,
  ) {}

  createSession(admin: AdminRecord, authSource: 'local'): SessionCreation {
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const expiresAt = addSecondsIso(this.ttlHours * 3600);
    const session = this.admins.createSession({
      adminId: admin.id,
      tokenHash: sha256Hex(token),
      csrfToken,
      authSource,
      expiresAt,
    });
    return {
      token,
      csrfToken,
      expiresAt,
      identity: publicAdminIdentity(admin, authSource, session.expiresAt),
    };
  }

  setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
    const maxAge = Math.max(1, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secureCookies,
      maxAge,
    });
  }

  clearSessionCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secureCookies,
    });
  }

  resolveToken(token: string | undefined): AdminSessionWithAdmin | null {
    if (!token) return null;
    const found = this.admins.getSessionWithAdmin(sha256Hex(token));
    if (!found) return null;
    if (isExpired(found.session.expiresAt)) {
      this.admins.deleteSession(found.session.id);
      return null;
    }
    const last = this.lastTouch.get(found.session.id) ?? 0;
    if (Date.now() - last > 60_000) {
      this.admins.touchSession(found.session.id);
      this.lastTouch.set(found.session.id, Date.now());
    }
    return found;
  }

  authenticateRequest(request: FastifyRequest): AuthenticatedAdmin | null {
    const token = request.cookies[SESSION_COOKIE];
    const found = this.resolveToken(token);
    if (!found) return null;
    return {
      session: found.session,
      admin: found.admin,
      identity: publicAdminIdentity(
        found.admin,
        found.session.authSource,
        found.session.expiresAt,
      ),
    };
  }

  requireRequest(request: FastifyRequest): AuthenticatedAdmin {
    const authenticated = this.authenticateRequest(request);
    if (!authenticated) throw unauthorized('Sign in to continue');
    return authenticated;
  }

  requireCsrf(request: FastifyRequest, authenticated: AuthenticatedAdmin): void {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const provided = request.headers[CSRF_HEADER];
    const value = Array.isArray(provided) ? provided[0] : provided;
    if (!value || !safeEqualString(value, authenticated.session.csrfToken)) {
      throw forbidden('Invalid or missing CSRF token');
    }
  }

  logout(request: FastifyRequest): void {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const hash = sha256Hex(token);
    const found = this.admins.getSessionWithAdmin(hash);
    if (found) this.admins.deleteSession(found.session.id);
  }

  issueCsrfToken(session: AdminSessionRecord): string {
    return session.csrfToken;
  }

  expiresAtFromNow(): string {
    return addSecondsIso(this.ttlHours * 3600);
  }

  now(): string {
    return nowIso();
  }
}
