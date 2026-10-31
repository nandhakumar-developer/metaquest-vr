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
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { gatewayConfig, settings, cloud, updateSettings } = useApp();

  const [formSettings, setFormSettings] = useState<AppSettings | null>(settings);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    <div className="space-y-8 max-w-4xl">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-cyan-400" />
          System Status & Gateway Configuration
        </h2>
        <p className="text-xs text-slate-400">
          Network endpoints, hardware acceleration status, and operator thresholds
        </p>
      </div>

      {/* Network & Endpoints */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Network className="w-4 h-4 text-cyan-400" />
          Local Gateway Endpoints
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-slate-400">Public Gateway URL:</span>
            <div className="font-mono text-cyan-400 text-sm mt-1">{gw?.publicUrl || 'http://localhost:4000'}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
            <span className="text-slate-400">WebSocket URL for Headsets:</span>
            <div className="font-mono text-cyan-400 text-sm mt-1">{gw?.wsUrl || 'ws://localhost:4000/ws'}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 col-span-1 md:col-span-2">
            <span className="text-slate-400">LAN Interface IP Addresses:</span>
            <div className="font-mono text-white text-sm mt-1">
              {gw?.lanAddresses?.length ? gw.lanAddresses.join(', ') : '127.0.0.1 (Localhost only)'}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Ensure Meta Quest 2 headsets are connected to the same Wi-Fi subnet as these IP addresses.
            </p>
          </div>
        </div>
      </div>

      {/* Hardware & Cloud Capabilities */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          Components & Services
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-400">SQLite Database</div>
              <div className="text-sm font-semibold text-white mt-0.5">Active (WAL)</div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-400">FFmpeg Inspection</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {gatewayConfig?.features.ffmpeg ? 'Installed' : 'Optional (Not found)'}
              </div>
            </div>
            {gatewayConfig?.features.ffmpeg ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400" />
            )}
          </div>

          <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-slate-400">Cloud Sync (Supabase)</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                {cloud?.configured ? (cloud.online ? 'Synchronized' : 'Offline') : 'Disabled (Local Mode)'}
              </div>
            </div>
            {cloud?.online ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : (
              <Shield className="w-5 h-5 text-slate-500" />
            )}
          </div>
        </div>
      </div>

      {/* Tunable Operational Settings */}
      {formSettings && (
        <form onSubmit={handleSettingsSubmit} className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-400" />
              Operational Parameters
            </h3>
            {saveSuccess && (
              <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Saved!
              </span>
            )}
            {saveError && (
              <span className="text-xs font-semibold text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" /> {saveError}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Stale Headset Threshold (Seconds)
              </label>
              <input
                type="number"
                min={5}
                max={120}
                value={formSettings.staleAfterSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, staleAfterSeconds: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500">
                Mark device offline after this many seconds without heartbeat.
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Seek Skip Step (Seconds)
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={formSettings.seekStepSeconds}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, seekStepSeconds: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500">
                Seconds to jump on quick forward/back buttons.
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Preview Snapshot Max FPS (1-5)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={formSettings.previewMaxFps}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, previewMaxFps: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500">
                Low frame rate protects headset decoding performance.
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Default Master Volume (0.0 - 1.0)
              </label>
              <input
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={formSettings.defaultVolume}
                onChange={(e) =>
                  setFormSettings({ ...formSettings, defaultVolume: Number(e.target.value) })
                }
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
              />
              <span className="text-[11px] text-slate-500">
                Starting audio level for new playback sessions.
              </span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-900/30"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Configuration</span>
            </button>
          </div>
        </form>
      )}

      {/* Admin Password Change */}
      <form onSubmit={handlePasswordSubmit} className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-cyan-400" />
          Change Administrator Password
        </h3>

        {pwSuccess && (
          <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Password successfully updated!
          </div>
        )}
        {pwError && (
          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> {pwError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">New Password (min 12 chars)</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition"
          >
            Update Password
          </button>
        </div>
      </form>
    </div>
  );
};

