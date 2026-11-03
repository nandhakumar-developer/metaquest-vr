import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import {
  ArrowRight,
  Glasses,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

export const BootstrapView: React.FC = () => {
  const { bootstrap } = useApp();
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token.trim()) {
      setError('Please provide the one-time setup token from the gateway console.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      await bootstrap(email.trim(), password, displayName.trim(), token.trim());
    } catch (err: any) {
      setError(err?.message || 'Failed to complete first-run setup. Check your setup token.');
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
            <div className="auth-eyebrow">A secure first step</div>
            <h1 className="auth-headline">
              Set up your
              <br />
              <span>control room.</span>
            </h1>
            <p className="auth-description">
              Create your administrator account to start pairing headsets and
              managing your Quest fleet from one local workspace.
            </p>
            <div className="auth-highlights">
              <div className="auth-highlight">
                <span className="auth-highlight-icon"><KeyRound size={15} /></span>
                One-time gateway token verification
              </div>
              <div className="auth-highlight">
                <span className="auth-highlight-icon"><ShieldCheck size={15} /></span>
                Administrator-only device controls
              </div>
            </div>
          </div>

          <div className="auth-story-footer">
            <span className="auth-local-indicator">Local gateway setup</span>
            <span>VRCC&nbsp; / &nbsp;01</span>
          </div>
        </aside>

        <section className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-form-kicker"><ShieldCheck size={14} /> Initial gateway setup</div>
            <h2 className="auth-form-title">Create admin account</h2>
            <p className="auth-form-subtitle">
              Your first account will have administrator access.
            </p>

            {error && (
              <div className="auth-error" role="alert">
                <KeyRound size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div>
                <label className="auth-field-label" htmlFor="setup-token">One-time setup token</label>
                <div className="auth-input-wrap">
                  <KeyRound className="auth-input-icon" size={17} />
                  <input
                    id="setup-token"
                    type="text"
                    placeholder="From the gateway terminal"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    autoComplete="off"
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label className="auth-field-label" htmlFor="setup-email">Administrator email</label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={17} />
                  <input
                    id="setup-email"
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
                <label className="auth-field-label" htmlFor="setup-name">Display name <span className="font-normal text-[#90a0b2]">(optional)</span></label>
                <div className="auth-input-wrap">
                  <UserRound className="auth-input-icon" size={17} />
                  <input
                    id="setup-name"
                    type="text"
                    placeholder="Lead Operator"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label className="auth-field-label" htmlFor="setup-password">Password <span className="font-normal text-[#90a0b2]">(at least 12 characters)</span></label>
                <div className="auth-input-wrap">
                  <LockKeyhole className="auth-input-icon" size={17} />
                  <input
                    id="setup-password"
                    type="password"
                    placeholder="Create a strong password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <div>
                <label className="auth-field-label" htmlFor="setup-confirm-password">Confirm password</label>
                <div className="auth-input-wrap">
                  <LockKeyhole className="auth-input-icon" size={17} />
                  <input
                    id="setup-confirm-password"
                    type="password"
                    placeholder="Enter your password again"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={12}
                    required
                    className="auth-input"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="auth-submit">
                <span>{loading ? 'Creating administrator...' : 'Complete setup'}</span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="auth-form-footer">
              <ShieldCheck size={14} />
              Your account is stored by this local gateway.
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
