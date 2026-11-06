import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  ArrowRight,
  Eye,
  EyeOff,
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      // Try local gateway login first (supports non-email usernames like vradmin@2026)
      try {
        await login(email.trim(), password);
        return;
      } catch (localErr: any) {
        // Fall back to Supabase if local login fails and credentials look like a real email
        const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
        if (!looksLikeEmail) throw localErr;
        try {
          await loginWithSupabase(email.trim(), password);
          return;
        } catch {
          throw localErr;
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Invalid username or password.');
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
              Sign in to your control center dashboard.
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
                    placeholder="Enter email or username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
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
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    required
                    className="auth-input auth-input-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="auth-password-toggle"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                <span>{loading ? 'Authenticating...' : 'Sign in to dashboard'}</span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="auth-form-footer">
              <ShieldCheck size={14} />
              Secure administrator authentication.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
