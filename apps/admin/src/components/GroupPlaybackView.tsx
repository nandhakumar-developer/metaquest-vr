import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupPlaybackPhase } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Gauge,
  Glasses,
  Play,
  RefreshCw,
  Square,
  Users,
  Video,
  WifiOff,
} from 'lucide-react';

interface GroupPlaybackViewProps {
  initialVideoId?: string | null;
}

const PHASE_LABELS: Record<GroupPlaybackPhase, string> = {
  idle: 'Idle',
  loading: 'Loading',
  ready: 'Ready',
  scheduled: 'Scheduled',
  playing: 'Playing',
  paused: 'Paused',
  ended: 'Ended',
  error: 'Error',
  offline: 'Offline',
};

const STATUS_STYLES: Record<string, string> = {
  idle: 'bg-slate-800 text-slate-300 border-slate-700',
  preparing: 'bg-amber-950/70 text-amber-300 border-amber-800/80',
  scheduled: 'bg-sky-950/70 text-sky-300 border-sky-800/80',
  playing: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80',
  stopped: 'bg-slate-800 text-slate-300 border-slate-700',
  error: 'bg-rose-950/70 text-rose-300 border-rose-800/80',
};

function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function driftLabel(driftMs: number | null): string {
  if (driftMs === null || !Number.isFinite(driftMs)) return '—';
  const rounded = Math.round(driftMs);
  return `${rounded > 0 ? '+' : ''}${rounded} ms`;
}

function healthStyle(health: 'good' | 'fair' | 'poor' | 'unknown'): string {
  switch (health) {
    case 'good':
      return 'text-emerald-400';
    case 'fair':
      return 'text-amber-400';
    case 'poor':
      return 'text-rose-400';
    default:
      return 'text-slate-500';
  }
}

export const GroupPlaybackView: React.FC<GroupPlaybackViewProps> = ({ initialVideoId }) => {
  const {
    devices,
    videos,
    group,
    startGroupPlayback,
    stopGroupPlayback,
  } = useApp();

  const onlineDevices = useMemo(() => devices.filter((device) => device.online), [devices]);
  const [mode, setMode] = useState<'same' | 'mixed'>('same');
  const [sharedVideoId, setSharedVideoId] = useState(initialVideoId || '');
  const [perDeviceVideo, setPerDeviceVideo] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leadMs, setLeadMs] = useState(4000);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const initializedSelection = useRef(false);

  useEffect(() => {
    if (initialVideoId) setSharedVideoId(initialVideoId);
  }, [initialVideoId]);

  useEffect(() => {
    if (!sharedVideoId && videos.length > 0) {
      setSharedVideoId(initialVideoId || videos[0].id);
    }
  }, [initialVideoId, sharedVideoId, videos]);

  useEffect(() => {
    if (initializedSelection.current || onlineDevices.length === 0) return;
    initializedSelection.current = true;
    setSelectedIds(onlineDevices.map((device) => device.id));
  }, [onlineDevices]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => devices.some((device) => device.id === id)));
  }, [devices]);

  useEffect(() => {
    if (!group || !['preparing', 'scheduled', 'playing'].includes(group.status)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [group]);

  const selectedDevices = devices.filter((device) => selectedIds.includes(device.id));
  const videoById = useMemo(() => new Map(videos.map((video) => [video.id, video])), [videos]);

  const assignments = selectedDevices
    .map((device) => ({
      deviceId: device.id,
      videoId:
        mode === 'same'
          ? sharedVideoId
          : perDeviceVideo[device.id] || sharedVideoId,
    }))
    .filter((assignment) => Boolean(assignment.videoId));

  const toggleDevice = (deviceId: string) => {
    setSelectedIds((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : [...current, deviceId],
    );
  };

  const selectAllOnline = () => {
    setSelectedIds(onlineDevices.map((device) => device.id));
  };

  const clearSelection = () => setSelectedIds([]);

  const setDeviceVideo = (deviceId: string, videoId: string) => {
    setPerDeviceVideo((current) => ({ ...current, [deviceId]: videoId }));
  };

  const handleStart = async () => {
    setError(null);
    setNotice(null);
    if (assignments.length === 0) {
      setError('Select at least one online headset and choose a video.');
      return;
    }
    if (mode === 'same' && !sharedVideoId) {
      setError('Choose a video to play on the group.');
      return;
    }
    if (mode === 'mixed' && assignments.length !== selectedDevices.length) {
      setError('Every selected headset needs a video in per-headset mode.');
      return;
    }
    if (
      group &&
      ['preparing', 'scheduled', 'playing'].includes(group.status) &&
      !window.confirm('A group run is already active. Replace it with this new run?')
    ) {
      return;
    }

    try {
      setBusy(true);
      const next = await startGroupPlayback({ assignments, leadMs });
      setNotice(
        next.status === 'error'
          ? next.message || 'The group could not start.'
          : 'Group start requested. Headsets load the video, report ready, then start on a shared timestamp.',
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to start group playback.');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setError(null);
    setNotice(null);
    if (!window.confirm('Stop group playback and send STOP to every headset in this run?')) return;
    try {
      setBusy(true);
      await stopGroupPlayback();
      setNotice('Group playback stopped.');
    } catch (err: any) {
      setError(err?.message || 'Failed to stop group playback.');
    } finally {
      setBusy(false);
    }
  };

  const scheduledInSeconds =
    group?.scheduledStartAt && group.status === 'scheduled'
      ? Math.max(0, (Date.parse(group.scheduledStartAt) - now) / 1000)
      : null;

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            Synchronized Group Playback
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            The gateway loads each selected headset, waits for a confirmed ready report, then sends
            a common future start timestamp. Each player schedules locally against its measured
            clock offset. Drift is monitored and corrected with a controlled seek.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${
              STATUS_STYLES[group?.status ?? 'idle'] || STATUS_STYLES.idle
            }`}
          >
            {group?.status === 'idle' || !group ? 'Idle' : group.status.toUpperCase()}
          </span>
          {group && group.status !== 'idle' && group.status !== 'stopped' && (
            <button
              onClick={() => void handleStop()}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition disabled:opacity-40"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop group
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-emerald-950/50 border border-emerald-800/70 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <section className="xl:col-span-2 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Glasses className="w-4 h-4 text-emerald-400" />
            Headsets
          </h3>

          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">
              {selectedDevices.length} of {devices.length} selected · {onlineDevices.length} online
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllOnline}
                className="text-cyan-400 hover:text-cyan-300 font-semibold"
              >
                Select online
              </button>
              <span className="text-slate-700">|</span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-slate-400 hover:text-slate-200 font-semibold"
              >
                Clear
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="p-6 text-center rounded-lg border border-dashed border-slate-800 text-xs text-slate-400">
              Pair a headset first from the Headsets page.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => {
                const checked = selectedIds.includes(device.id);
                return (
                  <div
                    key={device.id}
                    className={`p-3 rounded-lg border transition ${
                      device.online
                        ? checked
                          ? 'bg-cyan-950/40 border-cyan-800/80'
                          : 'bg-slate-950/60 border-slate-800'
                        : 'bg-slate-950/40 border-slate-800/60 opacity-60'
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!device.online}
                        onChange={() => toggleDevice(device.id)}
                        className="mt-0.5 accent-cyan-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-white truncate">
                            {device.name}
                          </span>
                          {device.online ? (
                            <span className="text-[10px] uppercase font-mono text-emerald-400">
                              Online
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase font-mono text-slate-500 flex items-center gap-1">
                              <WifiOff className="w-3 h-3" /> Offline
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                          {device.model} · {device.ipAddress || 'No LAN IP'}
                        </div>

                        {mode === 'mixed' && checked && device.online && (
                          <select
                            value={perDeviceVideo[device.id] || sharedVideoId}
                            onChange={(event) => setDeviceVideo(device.id, event.target.value)}
                            className="mt-2 w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-cyan-500"
                          >
                            <option value="">Choose video…</option>
                            {videos.map((video) => (
                              <option key={video.id} value={video.id}>
                                {video.name} ({formatTime(video.durationSeconds)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-slate-800 space-y-3">
            <div>
              <div className="text-xs font-semibold text-slate-300 mb-1.5">Content mode</div>
              <div className="flex items-center bg-slate-950 rounded-lg p-0.5 border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('same')}
                  className={`flex-1 px-3 py-1.5 rounded ${
                    mode === 'same'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Same video
                </button>
                <button
                  type="button"
                  onClick={() => setMode('mixed')}
                  className={`flex-1 px-3 py-1.5 rounded ${
                    mode === 'mixed'
                      ? 'bg-slate-700 text-white font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Per headset
                </button>
              </div>
            </div>

            {mode === 'same' && (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Video for the group
                </label>
                <select
                  value={sharedVideoId}
                  onChange={(event) => setSharedVideoId(event.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 outline-none focus:border-cyan-500"
                >
                  <option value="">Choose video…</option>
                  {videos.map((video) => (
                    <option key={video.id} value={video.id}>
                      {video.name} ({formatTime(video.durationSeconds)}) ·{' '}
                      {video.projectionType.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Start lead time
              </label>
              <select
                value={leadMs}
                onChange={(event) => setLeadMs(Number(event.target.value))}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-2 outline-none focus:border-cyan-500"
              >
                <option value={3000}>3 seconds</option>
                <option value={4000}>4 seconds</option>
                <option value={5000}>5 seconds</option>
                <option value={8000}>8 seconds</option>
                <option value={10000}>10 seconds</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Longer lead time gives every headset time to finish buffering before the shared
                start timestamp.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy || videos.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition shadow-lg shadow-cyan-900/30 disabled:opacity-40"
            >
              {busy ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>{busy ? 'Working…' : 'Load and schedule group start'}</span>
            </button>
            {videos.length === 0 && (
              <p className="text-[11px] text-amber-400">
                Upload a video to the library before starting group playback.
              </p>
            )}
          </div>
        </section>

        <section className="xl:col-span-3 p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Gauge className="w-4 h-4 text-cyan-400" />
              Run feedback
            </h3>
            {group?.scheduledStartAt && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
                <Clock3 className="w-3.5 h-3.5" />
                {scheduledInSeconds !== null
                  ? `Start in ${scheduledInSeconds.toFixed(1)}s`
                  : `Started ${new Date(group.scheduledStartAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>

          {!group || group.status === 'idle' ? (
            <div className="p-10 text-center rounded-xl border border-dashed border-slate-800 bg-slate-950/40">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <h4 className="text-sm font-semibold text-slate-300">No group run yet</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Select headsets, choose a video, and start a scheduled group run. Independent
                per-headset controls remain available on the Headsets page at all times.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400">Mode</div>
                  <div className="text-sm font-semibold text-white mt-0.5 capitalize">
                    {group.mode === 'same' ? 'Same video' : 'Per headset'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400">Run position</div>
                  <div className="text-sm font-semibold text-white mt-0.5 font-mono">
                    {formatTime(group.positionSeconds)}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400">Headsets</div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {group.devices.filter((device) => device.phase !== 'offline').length}/
                    {group.devices.length}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-950/70 border border-slate-800">
                  <div className="text-slate-400">Lead time</div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {(group.leadMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {group.message && (
                <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300">
                  {group.message}
                </div>
              )}

              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="px-3 py-2">Headset</th>
                        <th className="px-3 py-2">Video</th>
                        <th className="px-3 py-2">Phase</th>
                        <th className="px-3 py-2">Position</th>
                        <th className="px-3 py-2">Drift</th>
                        <th className="px-3 py-2">Sync</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {group.devices.map((device) => (
                        <tr key={device.deviceId} className="bg-slate-900/40">
                          <td className="px-3 py-2.5 font-semibold text-slate-200">
                            {device.deviceName}
                            {device.error && (
                              <div className="text-[10px] text-rose-400 font-normal mt-0.5">
                                {device.error}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 max-w-[180px] truncate">
                            {device.videoName ||
                              (device.videoId ? videoById.get(device.videoId)?.name : null) ||
                              '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded border text-[10px] font-semibold ${
                                device.phase === 'playing'
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/70'
                                  : device.phase === 'error' || device.phase === 'offline'
                                    ? 'bg-rose-950/60 text-rose-300 border-rose-800/70'
                                    : device.phase === 'scheduled'
                                      ? 'bg-sky-950/60 text-sky-300 border-sky-800/70'
                                      : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {PHASE_LABELS[device.phase]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-300">
                            {formatTime(device.positionSeconds)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-300">
                            {driftLabel(device.driftMs)}
                          </td>
                          <td className={`px-3 py-2.5 font-semibold ${healthStyle(device.syncHealth)}`}>
                            {device.syncHealth === 'unknown' ? '—' : device.syncHealth}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
                <Video className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>
                  Drift is measured from confirmed player reports, so values update at the
                  heartbeat interval. Sync is coordinated over the local network and is not
                  frame-perfect; use the drift and sync columns to judge each headset.
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
