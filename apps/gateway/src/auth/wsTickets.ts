import { randomToken } from '../utils/ids.js';
import type { AuthenticatedAdmin } from './sessions.js';

interface TicketEntry {
  authenticated: AuthenticatedAdmin;
  expiresAt: number;
}

/** Short-lived, single-use tickets for authenticating browser WebSockets. */
export class WsTicketService {
  private readonly tickets = new Map<string, TicketEntry>();

  issue(authenticated: AuthenticatedAdmin, ttlMs = 30_000): { ticket: string; expiresAt: string } {
    const ticket = randomToken(32);
    const expiresAt = Date.now() + ttlMs;
    this.tickets.set(ticket, { authenticated, expiresAt });
    this.prune();
    return { ticket, expiresAt: new Date(expiresAt).toISOString() };
  }

  consume(ticket: string | null | undefined): AuthenticatedAdmin | null {
    if (!ticket) return null;
    const entry = this.tickets.get(ticket);
    if (!entry) return null;
    this.tickets.delete(ticket);
    if (entry.expiresAt <= Date.now()) return null;
    return entry.authenticated;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.tickets) {
      if (entry.expiresAt <= now) this.tickets.delete(key);
    }
    if (this.tickets.size > 1000) {
      const first = this.tickets.keys().next().value;
      if (first) this.tickets.delete(first);
    }
  }
}
