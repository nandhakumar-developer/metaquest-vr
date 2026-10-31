import { createClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from '../config.js';

export interface CloudAdapter {
  checkHealth(): Promise<boolean>;
  upsert(table: string, payload: Record<string, unknown>, onConflict?: string): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  uploadObject?(path: string, data: Buffer, contentType: string): Promise<void>;
  signedDownloadUrl?(path: string, expiresInSeconds: number): Promise<string>;
}

export class SupabaseCloudAdapter implements CloudAdapter {
  private readonly client;
  private readonly url: string;
  private readonly anonKey: string;

  constructor(private readonly config: SupabaseConfig) {
    if (!config.url || !config.serviceRoleKey) {
      throw new Error('Supabase cloud adapter requires URL and service role key');
    }
    this.url = config.url.replace(/\/+$/, '');
    this.anonKey = config.anonKey ?? config.serviceRoleKey;
    this.client = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.url}/auth/v1/health`, {
        headers: { apikey: this.anonKey, Authorization: `Bearer ${this.anonKey}` },
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async upsert(
    table: string,
    payload: Record<string, unknown>,
    onConflict?: string,
  ): Promise<void> {
    const { error } = await this.client
      .from(table)
      .upsert(payload, onConflict ? { onConflict } : undefined);
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }

  async remove(table: string, id: string): Promise<void> {
    const { error } = await this.client.from(table).delete().eq('id', id);
    if (error) throw new Error(`${table} delete failed: ${error.message}`);
  }

  async uploadObject(path: string, data: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(this.config.bucket)
      .upload(path, data, { contentType, upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async signedDownloadUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.config.bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message ?? 'unknown'}`);
    return data.signedUrl;
  }
}

export function createCloudAdapter(config: SupabaseConfig): CloudAdapter | null {
  if (!config.configured || !config.serviceRoleKey) return null;
  return new SupabaseCloudAdapter(config);
}
