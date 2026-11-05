import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  ArrowRight,
  KeyRound,
  LockKeyhole,
  Mail,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, loginWithSupabase } = useApp();
  const [email, setEmail] = useState((import.meta.env.VITE_ADMIN_EMAIL as string) || 'vradmin@2026');
  const [password, setPassword] = useState((import.meta.env.VITE_ADMIN_PASSWORD as string) || 'vradmin7726');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      // Attempt Supabase login first
      try {
        await loginWithSupabase(email.trim(), password);
        return;
      } catch (supabaseErr: any) {
        // Fall back seamlessly to gateway local admin
        try {
          await login(email.trim(), password);
          return;
        } catch {
          throw supabaseErr;
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid credentials.');
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
              <img src="/image.png" alt="Meta Quest" className="brand-logo" />
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
              Sign in with your Supabase administrator account.
            </p>

            {error && (
              <div className="auth-error" role="alert">
                <KeyRound size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div>
                <label className="auth-field-label" htmlFor="admin-email">Administrator email or username</label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={17} />
                  <input
                    id="admin-email"
                    type="text"
                    placeholder="vradmin@2026"
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
                <span>{loading ? 'Authenticating...' : 'Sign in to dashboard'}</span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="auth-form-footer">
              <ShieldCheck size={14} />
              Your credentials are securely verified via Supabase Auth.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
