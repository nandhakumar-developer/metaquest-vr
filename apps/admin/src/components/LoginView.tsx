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
<<<<<<< HEAD
  const { login } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
=======
  const { login, loginWithSupabase } = useApp();
  const [email, setEmail] = useState((import.meta.env.VITE_ADMIN_EMAIL as string) || 'vradmin@2026');
  const [password, setPassword] = useState((import.meta.env.VITE_ADMIN_PASSWORD as string) || 'vradmin7726');
>>>>>>> origin/main
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
<<<<<<< HEAD
      setError(err?.message || 'Invalid username or password.');
=======
      setError(err?.message || 'Invalid credentials.');
>>>>>>> origin/main
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_12%_18%,rgba(78,126,255,0.16)_0%,transparent_45%),radial-gradient(circle_at_88%_82%,rgba(0,76,228,0.12)_0%,transparent_48%),#FAF8F5] p-[clamp(16px,4vw,48px)] max-[820px]:items-start max-[820px]:overflow-y-auto">
      <div className="grid min-h-[680px] w-full max-w-[1140px] grid-cols-[1.04fr_0.96fr] overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_24px_60px_-15px_rgba(0,76,228,0.14)] backdrop-blur-[28px] max-[820px]:min-h-0 max-[820px]:grid-cols-1 max-[820px]:rounded-3xl">
        <aside className="relative flex min-w-0 flex-col justify-between overflow-hidden border-r border-white/60 bg-gradient-to-br from-[#F3F6FF]/85 to-[#EAF0FF]/70 p-[clamp(32px,5vw,58px)] text-[#111111] backdrop-blur-[20px] max-[820px]:min-h-0 max-[820px]:border-r-0 max-[820px]:border-b max-[820px]:border-b-[#E1E1E1] max-[820px]:px-[26px] max-[820px]:pb-6 max-[820px]:pt-[26px]">
          <div className="relative z-[1] flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/85 bg-white/90 text-[#004CE4] shadow-[0_10px_24px_-14px_rgba(0,76,228,0.35)] backdrop-blur-[10px]">
              <img src="/image.png" alt="Meta Quest" className="block h-full w-full object-cover" />
            </div>
            <div>
              <div className="font-display text-[14.5px] font-bold tracking-[-0.02em]">VR Control Center</div>
              <div className="mt-0.5 text-[11px] text-[#555555]">Quest fleet management</div>
            </div>
          </div>

          <div className="relative z-[1] my-[52px] mb-9 max-w-[460px] max-[820px]:my-[30px] max-[820px]:mb-[22px]">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#004CE4] before:inline-block before:h-[1.5px] before:w-[18px] before:rounded-full before:bg-gradient-to-r before:from-[#4E7EFF] before:to-[#004CE4] before:content-['']">Local-first device control</div>
            <h1 className="my-[18px] mb-[14px] font-display text-[clamp(38px,5vw,60px)] font-bold leading-[1.02] tracking-[-0.06em] text-[#111111] max-w-[440px] max-[820px]:my-[14px] max-[820px]:mb-[10px] max-[820px]:text-[clamp(34px,9vw,46px)]">
              Every headset.
              <br />
              <span className="bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] bg-clip-text font-serif font-normal italic tracking-[-0.02em] text-transparent">Under control.</span>
            </h1>
            <p className="max-w-[390px] text-[13.5px] leading-[1.75] text-[#555555] max-[820px]:text-[12.5px]">
              One focused workspace for your Meta Quest fleet. Pair devices,
              manage content, and keep playback running smoothly.
            </p>
            <div className="mt-7 grid gap-2.5 max-[820px]:hidden">
              <div className="flex items-center gap-[11px] text-[12px] font-medium text-[#555555]">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] border border-white/85 bg-white/90 text-[#004CE4] shadow-[0_2px_8px_rgba(0,76,228,0.1)]"><Radio size={15} /></span>
                Live device status and playback controls
              </div>
              <div className="flex items-center gap-[11px] text-[12px] font-medium text-[#555555]">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] border border-white/85 bg-white/90 text-[#004CE4] shadow-[0_2px_8px_rgba(0,76,228,0.1)]"><Smartphone size={15} /></span>
                Built for your Quest 2 fleet
              </div>
              <div className="flex items-center gap-[11px] text-[12px] font-medium text-[#555555]">
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] border border-white/85 bg-white/90 text-[#004CE4] shadow-[0_2px_8px_rgba(0,76,228,0.1)]"><ShieldCheck size={15} /></span>
                Operates locally on your network
              </div>
            </div>
          </div>

        </aside>

<<<<<<< HEAD
        <section className="flex items-center justify-center bg-white/65 p-[clamp(28px,5vw,62px)] backdrop-blur-2xl max-[820px]:px-[26px] max-[820px]:pb-[34px] max-[820px]:pt-[30px]">
          <div className="w-full max-w-[382px]">
            <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#004CE4]"><Sparkles size={14} /> Administrator access</div>
            <h2 className="my-[13px] mb-[7px] font-display text-[29px] font-bold tracking-[-0.045em]">Welcome back</h2>
            <p className="mb-7 text-[12.5px] leading-[1.65] text-[#64748B] max-[820px]:mb-[22px]">
              Sign in to your control center dashboard.
=======
        <section className="auth-form-panel">
          <div className="auth-form-content">
            <div className="auth-form-kicker"><Sparkles size={14} /> Administrator access</div>
            <h2 className="auth-form-title">Welcome back</h2>
            <p className="auth-form-subtitle">
              Sign in with your Supabase administrator account.
>>>>>>> origin/main
            </p>

            {error && (
              <div className="mb-[18px] flex items-start gap-2.5 rounded-[13px] border border-[#FF2525]/25 bg-[#FF2525]/10 p-3 px-[14px] text-[11.5px] leading-[1.55] text-[#B91C1C] [&_svg]:mt-px [&_svg]:shrink-0" role="alert">
                <KeyRound size={16} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="grid gap-[18px]">
              <div>
<<<<<<< HEAD
                <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]" htmlFor="admin-email">Administrator email or username</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[#64748B]" size={17} />
                  <input
                    id="admin-email"
                    type="text"
                    placeholder="Enter email or username"
=======
                <label className="auth-field-label" htmlFor="admin-email">Administrator email or username</label>
                <div className="auth-input-wrap">
                  <Mail className="auth-input-icon" size={17} />
                  <input
                    id="admin-email"
                    type="text"
                    placeholder="vradmin@2026"
>>>>>>> origin/main
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                    required
                    className="min-h-[47px] w-full rounded-[13px] border border-black/10 bg-white/85 py-0 pl-[42px] pr-[14px] text-[12.5px] text-[#111111] shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] backdrop-blur-xl outline-none transition hover:border-[#004CE4] focus:border-[#004CE4]/65 focus:bg-white focus:ring-[3px] focus:ring-[#004CE4]/15"
                  />
                </div>
              </div>

              <div>
                <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]" htmlFor="admin-password">Password</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-[14px] top-1/2 -translate-y-1/2 text-[#64748B]" size={17} />
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    required
                    className="min-h-[47px] w-full rounded-[13px] border border-black/10 bg-white/85 py-0 pl-[42px] pr-[14px] text-[12.5px] text-[#111111] shadow-[inset_0_1px_2px_rgba(0,0,0,0.025)] backdrop-blur-xl outline-none transition hover:border-[#004CE4] focus:border-[#004CE4]/65 focus:bg-white focus:ring-[3px] focus:ring-[#004CE4]/15 pr-[46px]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-[10px] top-1/2 grid h-[30px] w-[30px] -translate-y-1/2 place-items-center rounded-lg border-0 bg-transparent text-[#8A8A8A] transition hover:bg-[#004CE4]/20 hover:text-[#004CE4]"
                    title={showPassword ? 'Hide password' : 'Show password'}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading} className="mt-[3px] flex min-h-12 w-full items-center justify-center gap-[9px] rounded-full border border-[#003BB5] bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-[12.5px] font-bold text-white shadow-[0_4px_20px_rgba(0,76,228,0.28)] transition hover:-translate-y-px hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_6px_22px_rgba(0,76,228,0.35)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#004CE4]/45 disabled:cursor-wait disabled:opacity-60">
                <span>{loading ? 'Authenticating...' : 'Sign in to dashboard'}</span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-[7px] text-center text-[10.5px] text-[#64748B] [&_svg]:shrink-0 [&_svg]:text-[#004CE4]">
              <ShieldCheck size={14} />
<<<<<<< HEAD
              Secure administrator authentication.
=======
              Your credentials are securely verified via Supabase Auth.
>>>>>>> origin/main
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};
