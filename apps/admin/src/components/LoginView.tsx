import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useApp } from '../context/AppContext.js';
import {
  ArrowRight,
  Cloud,
  Glasses,
  KeyRound,
  LockKeyhole,
  Mail,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';

type AuthMode = 'local' | 'supabase';

export const LoginView: React.FC = () => {
  const { login, loginWithSupabase, gatewayConfig } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabaseConfig = gatewayConfig?.auth.supabase;
  const supabaseEnabled = Boolean(supabaseConfig?.roleVerification);
  const [authMode, setAuthMode] = useState<AuthMode>('local');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      if (authMode === 'supabase') {
        if (!supabaseConfig?.roleVerification) {
          throw new Error('Supabase sign-in is not available on this gateway.');
        }
        const client = createClient(supabaseConfig.url, supabaseConfig.anonKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        const { data, error: signInError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError || !data.session?.access_token) {
          throw new Error(signInError?.message || 'Supabase sign-in failed.');
        }
        await loginWithSupabase(data.session.access_token);
      } else {
        await login(email.trim(), password);
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-story">
          <div className="auth-brand">
            <div className="auth-brand-mark">
              <Glasses size={23} strokeWidth={1.8} />
            </div>
            <div>
              <div className="auth-brand-name">VR Control Center</div>
              <div className="auth-brand-caption">Quest fleet management</div>
            </div>
          </div>

          <div className="auth-story-copy">
            <div className="auth-eyebrow">Local-first device control</div>
            <h1 className="auth-headline">
              Every headset.
              <br />
              <span>Under control.</span>
            </h1>
            <p className="auth-description">
              One focused workspace for your Meta Quest fleet. Pair devices,
              manage content, and keep playback running smoothly.
            </p>
            <div className="auth-highlights">
              <div className="auth-highlight">
                <span className="auth-highlight-icon"><Radio size={15} /></span>
                Live device status and playback controls
              </div>
              <div className="auth-highlight">
                <span className="auth-highlight-icon"><Smartphone size={15} /></span>
                Built for your Quest 2 fleet
              </div>
              <div className="auth-highlight">
                <span className="auth-highlight-icon"><ShieldCheck size={15} /></span>
                Operates locally on your network
              </div>
            </div>
          </div>

          <div className="auth-story-footer">
            <span className="auth-local-indicator">Private by design</span>
            <span>VRCC&nbsp; / &nbsp;01</span>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-form-kicker"><Sparkles size={14} /> Administrator access</div>
            <h2 className="auth-form-title">Welcome back</h2>
            <p className="auth-form-subtitle">
              Sign in to continue to your headset control center.
            </p>

            {supabaseEnabled && (
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl border border-slate-700/80 bg-slate-950/60 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('local');
                    setError(null);
                  }}
                  aria-pressed={authMode === 'local'}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    authMode === 'local'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <KeyRound size={14} />
                  Local admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('supabase');
                    setError(null);
                  }}
                  aria-pressed={authMode === 'supabase'}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    authMode === 'supabase'
                      ? 'bg-slate-700 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Cloud size={14} />
                  Supabase
                </button>
              </div>
            )}

            {supabaseEnabled && (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                {authMode === 'supabase'
                  ? 'The gateway verifies your Supabase session and requires an admin, operator, or viewer role in the profiles table.'
                  : 'Uses the administrator account stored locally on this gateway.'}
              </p>
            )}

            {error && (
              <div className="auth-error" role="alert">
                <KeyRound size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div>
                <label className="auth-field-label" htmlFor="admin-email">Administrator email</label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={17} />
                  <input
                    id="admin-email"
                    type="email"
                    placeholder="admin@vrcenter.local"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label className="auth-field-label" htmlFor="admin-password">Password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole className="auth-input-icon" size={17} />
                  <input
                    id="admin-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                <span>
                  {loading
                    ? 'Authenticating...'
                    : authMode === 'supabase'
                      ? 'Sign in with Supabase'
                      : 'Sign in to dashboard'}
                </span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="auth-form-footer">
              <ShieldCheck size={14} />
              {authMode === 'supabase'
                ? 'Supabase credentials are verified by your project; the service-role key stays on the gateway.'
                : 'Your credentials stay on this local gateway.'}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
