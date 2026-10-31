import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../config.js';
import { forbidden, unavailable, unauthorized } from '../utils/errors.js';
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
 * `profiles` table using the service-role key (server-side only).
 */
export class SupabaseAuthService {
  private readonly authClient: SupabaseClient | null = null;
  private readonly adminClient: SupabaseClient | null = null;
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
    if (config.configured && config.url && config.serviceRoleKey) {
      this.adminClient = createClient(config.url, config.serviceRoleKey, {
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
    return Boolean(this.adminClient);
  }

  async verifyAccessToken(accessToken: string): Promise<SupabaseAdminIdentity> {
    if (!this.authClient) {
      throw unavailable('Supabase is not configured on this gateway');
    }
    if (!this.adminClient) {
      throw unavailable(
        'Supabase sign-in requires SUPABASE_SERVICE_ROLE_KEY on the gateway for role verification',
      );
    }
    const tokenKey = sha256Hex(accessToken);
    const cached = this.cache.get(tokenKey);
    if (cached && cached.expiresAt > Date.now()) return cached.identity;

    const { data, error } = await this.authClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw unauthorized('Supabase session is invalid or expired');
    }

    const { data: profile, error: profileError } = await this.adminClient
      .from('profiles')
      .select('display_name, role')
      .eq('id', data.user.id)
      .maybeSingle<{ display_name: string | null; role: string | null }>();

    if (profileError) {
      throw unavailable(`Unable to verify administrator profile: ${profileError.message}`);
    }
    if (!profile) {
      throw forbidden('No VR Control Center profile is assigned to this Supabase account');
    }
    const role = profile.role;
    if (role !== 'admin' && role !== 'operator' && role !== 'viewer') {
      throw forbidden('This account does not have a VR Control Center role');
    }
    const identity: SupabaseAdminIdentity = {
      authUserId: data.user.id,
      email: data.user.email ?? '',
      displayName: profile.display_name?.trim() || data.user.email || 'Administrator',
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
