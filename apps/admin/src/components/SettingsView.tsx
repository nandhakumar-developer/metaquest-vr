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
    <div className="page-stack max-w-5xl">
      <div className="section-head">
        <div>
          <span className="eyebrow">Configuration</span>
          <h1 className="page-title">
            System <span className="serif-accent text-[#ED7109]">settings</span>
          </h1>
          <p className="page-desc">
            Network endpoints, hardware acceleration status, and the operational thresholds that keep
            this gateway in shape.
          </p>
        </div>
      </div>

      {/* Network */}
      <section className="panel panel-pad space-y-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
          <span className="grid h-7 w-7 place-items-center tint-lilac">
            <Network className="h-3.5 w-3.5" />
          </span>
          Local gateway endpoints
        </h3>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="panel-inset px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#8A8A8A]">
              <Globe2 className="h-3 w-3" /> Public gateway URL
            </span>
            <div className="mt-1 break-all font-mono text-[12.5px] text-[#555555]">
              {gw?.publicUrl || 'http://localhost:4000'}
            </div>
          </div>

          <div className="panel-inset px-4 py-3">
            <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-[#8A8A8A]">
              <Radio className="h-3 w-3" /> WebSocket URL for headsets
            </span>
            <div className="mt-1 break-all font-mono text-[12.5px] text-[#555555]">
              {gw?.wsUrl || 'ws://localhost:4000/ws'}
            </div>
          </div>

          <div className="panel-inset px-4 py-3 md:col-span-2">
            <span className="text-[10.5px] font-medium text-[#8A8A8A]">LAN interface IP addresses</span>
            <div className="mt-1 font-mono text-[12.5px] text-[#111111]">
              {gw?.lanAddresses?.length ? gw.lanAddresses.join(', ') : '127.0.0.1 (Localhost only)'}
            </div>
            <p className="field-hint">
              Ensure Meta Quest 2 headsets are connected to the same Wi-Fi subnet as these addresses.
            </p>
          </div>
        </div>
      </section>

      {/* Components */}
      <section className="panel panel-pad space-y-4">
        <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
          <span className="grid h-7 w-7 place-items-center tint-mint">
            <Cpu className="h-3.5 w-3.5" />
          </span>
          Components &amp; services
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="panel-inset flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[10.5px] text-[#8A8A8A]">SQLite database</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#111111]">Active (WAL)</div>
            </div>
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[#20D9A5]" />
          </div>

          <div className="panel-inset flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[10.5px] text-[#8A8A8A]">FFmpeg inspection</div>
              <div className="mt-0.5 text-[12px] font-semibold text-[#111111]">
                {gatewayConfig?.features.ffmpeg ? 'Installed' : 'Optional (not found)'}
              </div>
            </div>
            {gatewayConfig?.features.ffmpeg ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#20D9A5]" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-[#FF9A00]" />
            )}
          </div>

          <div className="panel-inset flex items-center justify-between gap-3 px-4 py-3">
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
        <form onSubmit={handleSettingsSubmit} className="panel panel-pad space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
              <span className="grid h-7 w-7 place-items-center tint-gold">
                <Settings className="h-3.5 w-3.5" />
              </span>
              Operational parameters
            </h3>
            {saveSuccess && (
              <span className="badge badge-success">
                <CheckCircle2 className="h-3 w-3" /> Saved
              </span>
            )}
            {saveError && (
              <span className="badge badge-danger">
                <AlertCircle className="h-3 w-3" /> {saveError}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="field-label">Stale headset threshold (seconds)</label>
              <input
                type="number"
                min={5}
                max={120}
                value={formSettings.staleAfterSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, staleAfterSeconds: Number(e.target.value) })
                }
                className="input"
              />
              <span className="field-hint">
                Mark a device offline after this many seconds without a heartbeat.
              </span>
            </div>

            <div>
              <label className="field-label">Seek skip step (seconds)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={formSettings.seekStepSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, seekStepSeconds: Number(e.target.value) })
                }
                className="input"
              />
              <span className="field-hint">Seconds to jump on quick forward/back buttons.</span>
            </div>

            <div>
              <label className="field-label">Preview snapshot max FPS (5–15)</label>
              <input
                type="number"
                min={5}
                max={15}
                value={formSettings.previewMaxFps}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, previewMaxFps: Number(e.target.value) })
                }
                className="input"
              />
              <span className="field-hint">
                Defaults to 12 FPS. Higher values look smoother but use more headset and network
                capacity; snapshots may slow down on a busy device or Wi-Fi connection.
              </span>
            </div>

            <div>
              <label className="field-label">Default master volume (0.0 – 1.0)</label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={formSettings.defaultVolume}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, defaultVolume: Number(e.target.value) })
                }
                className="input"
              />
              <span className="field-hint">Starting audio level for new playback sessions.</span>
            </div>
          </div>

          <div className="flex justify-end border-t border-[#E1E1E1] pt-4">
            <button type="submit" className="btn btn-primary btn-sm">
              <Save className="h-3.5 w-3.5" />
              Save configuration
            </button>
          </div>
        </form>
      )}

      {/* Password */}
      <form onSubmit={handlePasswordSubmit} className="panel panel-pad space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
            <span className="grid h-7 w-7 place-items-center tint-coral">
              <KeyRound className="h-3.5 w-3.5" />
            </span>
            Change administrator password
          </h3>
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            className="btn btn-ghost btn-sm"
            aria-pressed={passwordVisible}
          >
            {passwordVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {passwordVisible ? 'Hide password' : 'Show password'}
          </button>
        </div>

        {pwSuccess && (
          <div className="alert alert-success">
            <CheckCircle2 className="h-4 w-4" /> Password successfully updated.
          </div>
        )}
        {pwError && (
          <div className="alert alert-danger">
            <AlertCircle className="h-4 w-4" /> {pwError}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="field-label">Current password</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="input"
            />
          </div>

          <div>
            <label className="field-label">New password (min 12 chars)</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="input"
            />
          </div>

          <div>
            <label className="field-label">Confirm new password</label>
            <input
              type={passwordVisible ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="input"
            />
          </div>
        </div>

        <div className="flex justify-end border-t border-[#E1E1E1] pt-4">
          <button type="submit" className="btn btn-secondary btn-sm">
            Update password
          </button>
        </div>
      </form>
    </div>
  );
};
