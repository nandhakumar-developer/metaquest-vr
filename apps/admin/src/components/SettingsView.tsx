import React, { useState, useEffect } from 'react';
import type { AppSettings } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import { apiRequest } from '../api/client.js';
import {
  Settings,
  Network,
  Cpu,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Shield,
  Save,
  Globe2,
  Radio,
  Eye,
  EyeOff,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { gatewayConfig, settings, cloud, updateSettings } = useApp();

  const [formSettings, setFormSettings] = useState<AppSettings | null>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) setFormSettings(settings);
  }, [settings]);

  const handleSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSettings) return;
    try {
      setSaveError(null);
      await updateSettings(formSettings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to update settings');
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword !== confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    if (newPassword.length < 12) {
      setPwError('Password must be at least 12 characters');
      return;
    }

    try {
      await apiRequest('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPwSuccess(false), 4000);
    } catch (err: any) {
      setPwError(err?.message || 'Failed to update password');
    }
  };

  const gw = gatewayConfig?.gateway;

  return (
    <div className="flex flex-col gap-[22px] max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Configuration</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
            System <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">settings</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            Network endpoints, hardware acceleration status, and the operational thresholds that keep
            this gateway in shape.
          </p>
        </div>
      </div>

      {/* Network */}
      <section className="relative rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-5 px-[22px] space-y-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
          <span className="grid h-7 w-7 place-items-center bg-[#004CE4]/20 text-[#004CE4]">
            <Network className="h-3.5 w-3.5" />
          </span>
          Local gateway endpoints
        </h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#8A8A8A]">
              <Globe2 className="h-3 w-3" /> Public gateway URL
            </span>
            <div className="mt-1 break-all font-mono text-[12.5px] text-[#555555]">
              {gw?.publicUrl || 'http://localhost:4000'}
            </div>
          </div>

          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#8A8A8A]">
              <Radio className="h-3 w-3" /> WebSocket URL for headsets
            </span>
            <div className="mt-1 break-all font-mono text-[12.5px] text-[#555555]">
              {gw?.wsUrl || 'ws://localhost:4000/ws'}
            </div>
          </div>

          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-4 py-3 md:col-span-2">
            <span className="text-[10.5px] font-medium text-[#8A8A8A]">LAN interface IP addresses</span>
            <div className="mt-1 font-mono text-[12.5px] text-[#111111]">
              {gw?.lanAddresses?.length ? gw.lanAddresses.join(', ') : '127.0.0.1 (Localhost only)'}
            </div>
            <p className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">
              Ensure Meta Quest 2 headsets are connected to the same Wi-Fi subnet as these addresses.
            </p>
          </div>
        </div>
      </section>

      {/* Components */}
      <section className="relative rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-5 px-[22px] space-y-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
          <span className="grid h-7 w-7 place-items-center bg-[#20D9A5]/15 text-[#08785D]">
            <Cpu className="h-3.5 w-3.5" />
          </span>
          Components &amp; services
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[10.5px] text-[#8A8A8A]">SQLite database</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#111111]">Active (WAL)</div>
            </div>
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#20D9A5]" />
          </div>

          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[10.5px] text-[#8A8A8A]">FFmpeg inspection</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#111111]">
                {gatewayConfig?.features.ffmpeg ? 'Installed' : 'Optional (not found)'}
              </div>
            </div>
            {gatewayConfig?.features.ffmpeg ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#20D9A5]" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-[#004CE4]" />
            )}
          </div>

          <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[10.5px] text-[#8A8A8A]">Cloud sync</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#111111]">
                {cloud?.configured ? (cloud.online ? 'Synchronized' : 'Offline') : 'Disabled (local)'}
              </div>
            </div>
            {cloud?.online ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#20D9A5]" />
            ) : (
              <Shield className="h-5 w-5 shrink-0 text-[#8A8A8A]" />
            )}
          </div>
        </div>
      </section>

      {/* Operational parameters */}
      {formSettings && (
        <form onSubmit={handleSettingsSubmit} className="relative rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-5 px-[22px] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
              <span className="grid h-7 w-7 place-items-center bg-[#004CE4]/15 text-[#003BB5]">
                <Settings className="h-3.5 w-3.5" />
              </span>
              Operational parameters
            </h3>
            {saveSuccess && (
              <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#20D9A5]/35 bg-[#20D9A5]/15 text-[#08785D]">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
            {saveError && (
              <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
                <AlertCircle className="h-3 w-3" /> {saveError}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Stale headset threshold (seconds)</label>
              <input
                type="number"
                min={5}
                max={120}
                value={formSettings.staleAfterSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, staleAfterSeconds: Number(e.target.value) })
                }
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">
                Mark a device offline after this many seconds without a heartbeat.
              </span>
            </div>

            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Seek skip step (seconds)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={formSettings.seekStepSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, seekStepSeconds: Number(e.target.value) })
                }
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">Seconds to jump on quick forward/back buttons.</span>
            </div>

            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Preview snapshot max FPS (5–15)</label>
              <input
                type="number"
                min={5}
                max={15}
                value={formSettings.previewMaxFps}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, previewMaxFps: Number(e.target.value) })
                }
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">
                Defaults to 12 FPS. Higher values look smoother but use more headset and network
                capacity; snapshots may slow down on a busy device or Wi-Fi connection.
              </span>
            </div>

            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Default master volume (0.0 – 1.0)</label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={formSettings.defaultVolume}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, defaultVolume: Number(e.target.value) })
                }
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
              <span className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">Starting audio level for new playback sessions.</span>
            </div>
          </div>

          <div className="flex justify-end border-t border-[#E1E1E1] pt-4">
            <button type="submit" className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px]">
              <Save className="h-3.5 w-3.5" />
              Save configuration
            </button>
          </div>
        </form>
      )}

      {/* Password */}
      <form onSubmit={handlePasswordSubmit} className="relative rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-5 px-[22px] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
            <span className="grid h-7 w-7 place-items-center bg-[#004CE4]/20 text-[#004CE4]">
              <KeyRound className="h-3.5 w-3.5" />
            </span>
            Change administrator password
          </h3>
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-8 gap-1.5 px-[13px] text-[11.5px]"
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {passwordVisible ? 'Hide password' : 'Show password'}
          </button>
        </div>

        {pwSuccess && (
          <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#20D9A5]/25 bg-[#20D9A5]/10 text-[#08785D]">
            <CheckCircle2 className="h-4 w-4" /> Password successfully updated.
          </div>
        )}
        {pwError && (
          <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
            <AlertCircle className="h-4 w-4" /> {pwError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Current password</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
            />
          </div>

          <div>
            <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">New password (min 12 chars)</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
            />
          </div>

          <div>
            <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Confirm new password</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-[#E1E1E1] pt-4">
          <button type="submit" className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px]">
            Update password
          </button>
        </div>
      </form>
    </div>
  );
};
