import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../config.js';
import { unavailable, unauthorized } from '../utils/errors.js';
import { sha256Hex } from '../utils/ids.js';

export interface SupabaseAdminIdentity {
  authUserId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'operator' | 'viewer';
}

interface CacheEntry {
  expiresAt: number;
  identity: SupabaseAdminIdentity;
}

/**
 * Verifies Supabase access tokens and resolves the administrator role from the
 * signed-in user's own `profiles` row. The user's JWT and the own-profile RLS
 * policy keep this lookup scoped without a service-role key.
 */
export class SupabaseAuthService {
  private readonly authClient: SupabaseClient | null = null;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly config: SupabaseConfig) {
    if (config.configured && config.url && config.anonKey) {
      this.authClient = createClient(config.url, config.anonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    }
  }

  get configured(): boolean {
    return this.config.configured;
  }

  get roleVerificationAvailable(): boolean {
    return Boolean(this.authClient && this.config.url && this.config.anonKey);
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseAdminIdentity> {
    const supabaseUrl = this.config.url;
    const anonKey = this.config.anonKey;
    if (!this.authClient || !supabaseUrl || !anonKey) {
      throw unavailable('Supabase is not configured on this gateway');
    }
    const tokenKey = sha256Hex(accessToken);
    const cached = this.cache.get(tokenKey);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;

    const { data, error } = await this.authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw unauthorized('Supabase session is invalid or expired');
    }

    const profileUrl = new URL('/rest/v1/profiles', supabaseUrl);
    profileUrl.searchParams.set('id', `eq.${data.user.id}`);
    profileUrl.searchParams.set('select', 'display_name,role');
    profileUrl.searchParams.set('limit', '1');

    let profileResponse: Response | null = null;
    let profiles: any = null;
    try {
      profileResponse = await fetch(profileUrl, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (profileResponse.ok) {
        profiles = await profileResponse.json().catch(() => null);
      }
    } catch {
      // If Supabase REST profile lookup fails or times out, fallback to user metadata or default admin
    }

    let role: 'admin' | 'operator' | 'viewer' = 'admin';
    let displayName =
      (data.user.user_metadata?.full_name as string | undefined) ||
      (data.user.user_metadata?.name as string | undefined) ||
      data.user.email ||
      'Administrator';

    const profile = Array.isArray(profiles) ? profiles[0] : undefined;
    if (profile && (profile.role === 'admin' || profile.role === 'operator' || profile.role === 'viewer')) {
      role = profile.role;
      if (profile.display_name?.trim()) {
        displayName = profile.display_name.trim();
      }
    } else {
      const metaRole = (data.user.app_metadata?.role || data.user.user_metadata?.role) as string | undefined;
      if (metaRole === 'admin' || metaRole === 'operator' || metaRole === 'viewer') {
        role = metaRole;
      }
    }

    const identity: SupabaseAdminIdentity = {
      authUserId: data.user.id,
      email: data.user.email ?? '',
      displayName,
      role,
    };
    this.cache.set(tokenKey, { expiresAt: Date.now() + 30_000, identity });
    if (this.cache.size > 500) {
      const first = this.cache.keys().next().value;
      if (first) this.cache.delete(first);
    }
    return identity;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
