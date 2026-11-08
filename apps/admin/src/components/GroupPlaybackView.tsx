import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GroupPlaybackPhase } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
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

const GROUP_STATUS_TONE: Record<string, string> = {
  idle: 'badge-neutral',
  preparing: 'badge-warning',
  scheduled: 'badge-info',
  playing: 'badge-success',
  stopped: 'badge-neutral',
  error: 'badge-danger',
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
      return 'text-[#08785D]';
    case 'fair':
      return 'text-[#003BB5]';
    case 'poor':
      return 'text-[#B91C1C]';
    default:
      return 'text-[#8A8A8A]';
  }
}

function phaseTone(phase: GroupPlaybackPhase): string {
  if (phase === 'playing') return 'badge-success';
  if (phase === 'error' || phase === 'offline') return 'badge-danger';
  if (phase === 'scheduled') return 'badge-info';
  if (phase === 'loading' || phase === 'ready') return 'badge-warning';
  return 'badge-neutral';
}

export const GroupPlaybackView: React.FC<GroupPlaybackViewProps> = ({ initialVideoId }) => {
  const { devices, videos, group, startGroupPlayback, stopGroupPlayback } = useApp();

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
      videoId: mode === 'same' ? sharedVideoId : perDeviceVideo[device.id] || sharedVideoId,
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

  const statusTone = GROUP_STATUS_TONE[group?.status ?? 'idle'] || 'badge-neutral';

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="mx-auto w-full max-w-[1120px] flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Synchronized playback</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
            Group <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">playback</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            Load each selected headset, wait for a confirmed ready report, then start every player on
            a shared future timestamp. Drift is monitored and corrected with controlled seeks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] ${statusTone} h-7 px-3 uppercase`}>
            {group?.status === 'idle' || !group ? 'Idle' : group.status}
          </span>
          {group && group.status !== 'idle' && group.status !== 'stopped' && (
            <button onClick={() => void handleStop()} disabled={busy} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-[#FF2525] text-white shadow-[0_4px_12px_rgba(255,37,37,0.14)] hover:brightness-105 h-8 gap-1.5 px-[13px] text-[11.5px]">
              <Square className="h-3 w-3" />
              Stop group
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#20D9A5]/25 bg-[#20D9A5]/10 text-[#08785D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="relative rounded-[24px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-4 px-[18px] space-y-3 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#20D9A5]/15 text-[#08785D]">
                <img src="/meta.png" alt="" className="h-6 w-6 object-contain" />
              </span>
              Headsets
            </h3>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8A8A8A]">{onlineDevices.length} online now</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllOnline}
                className="font-semibold text-[#004CE4] transition hover:text-[#B91C1C]"
              >
                Select online
              </button>
              <span className="text-[#E1E1E1]">/</span>
              <button
                type="button"
                onClick={clearSelection}
                className="font-semibold text-[#8A8A8A] transition hover:text-[#111111]"
              >
                Clear
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E1E1E1] px-4 py-6 text-center text-[11px] text-[#8A8A8A]">
              Pair a headset first from the Headsets page.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => {
                const checked = selectedIds.includes(device.id);
                return (
                  <div
                    key={device.id}
                    className={`rounded-xl border px-3 py-2 transition ${
                      device.online
                        ? checked
                          ? 'border-[#004CE4]/30 bg-[#EAF0FF]'
                          : 'border-[#E1E1E1] bg-[#F5F5F5] hover:border-[#E1E1E1]'
                        : 'border-[#E1E1E1] bg-[#F5F5F5] opacity-60'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-[15px] w-[15px] cursor-pointer rounded-[5px] accent-[#004CE4]"
                        checked={checked}
                        disabled={!device.online}
                        onChange={() => toggleDevice(device.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-semibold text-[#111111]">
                            {device.name}
                          </span>
                          {device.online ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-[#08785D]">
                              <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-[#8A8A8A] bg-[#20D9A5] shadow-[0_0_0_3px_rgba(32,217,165,0.16)] animate-pulse !h-1.5 !w-1.5" />
                              Online
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-[#8A8A8A]">
                              <WifiOff className="h-3 w-3" /> Offline
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-[#8A8A8A]">
                          {!device.model.toLowerCase().includes('meta quest browser') && (
                            <>{device.model} · </>
                          )}
                          {device.ipAddress || 'No LAN IP'}
                        </div>

                        {mode === 'mixed' && checked && device.online && (
                          <select
                            value={perDeviceVideo[device.id] || sharedVideoId}
                            onChange={(event) => setDeviceVideo(device.id, event.target.value)}
                            className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45 min-h-[34px] rounded-[10px] py-0 pl-[11px] pr-8 text-[11.5px] mt-2"
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

          <div className="space-y-3 border-t border-[#E1E1E1] pt-4">
            <div>
              <div className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Content mode</div>
              <div className="inline-flex items-center gap-0.5 rounded-[22px] border border-transparent bg-white/50 p-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-[28px] w-full">
                <button
                  type="button"
                  onClick={() => setMode('same')}
                  className={`inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full px-[13px] text-[11.5px] font-semibold text-[#475569] transition-all hover:bg-white/45 hover:text-[#0F172A] flex-1 justify-center ${mode === 'same' ? 'border-transparent bg-white/90 text-[#004CE4] shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : ''}`}
                >
                  Same video
                </button>
                <button
                  type="button"
                  onClick={() => setMode('mixed')}
                  className={`inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full px-[13px] text-[11.5px] font-semibold text-[#475569] transition-all hover:bg-white/45 hover:text-[#0F172A] flex-1 justify-center ${mode === 'mixed' ? 'border-transparent bg-white/90 text-[#004CE4] shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : ''}`}
                >
                  Per headset
                </button>
              </div>
            </div>

            {mode === 'same' && (
              <div>
                <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Video for the group</label>
                <select
                  value={sharedVideoId}
                  onChange={(event) => setSharedVideoId(event.target.value)}
                  className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
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
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Start lead time</label>
              <select
                value={leadMs}
                onChange={(event) => setLeadMs(Number(event.target.value))}
                className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              >
                <option value={3000}>3 seconds</option>
                <option value={4000}>4 seconds</option>
                <option value={5000}>5 seconds</option>
                <option value={8000}>8 seconds</option>
                <option value={10000}>10 seconds</option>
              </select>
              <p className="mt-1.5 block text-[10.5px] leading-[1.55] text-[#64748B]">
                Longer lead time gives every headset time to finish buffering before the shared start
                timestamp.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy || videos.length === 0}
              className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] w-full"
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              <span>{busy ? 'Working…' : 'Load and schedule group start'}</span>
            </button>
            {videos.length === 0 && (
              <p className="text-[10.5px] text-[#003BB5]">
                Upload a video to the library before starting group playback.
              </p>
            )}
          </div>
        </section>

        <section className="relative rounded-[24px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] p-4 px-[18px] space-y-3 xl:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#111111]">
              Run feedback
            </h3>
            {group?.scheduledStartAt && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#8A8A8A]">
                <Clock3 className="h-3.5 w-3.5" />
                {scheduledInSeconds !== null
                  ? `Start in ${scheduledInSeconds.toFixed(1)}s`
                  : `Started ${new Date(group.scheduledStartAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>

          {!group || group.status === 'idle' ? (
            <div className="rounded-2xl border border-dashed border-[#E1E1E1] bg-[#F5F5F5] px-6 py-12 text-center">
              <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="font-display text-[15px] font-bold tracking-[-0.02em]">No group run yet</h4>
              <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">
                Select headsets, choose a video, and start a scheduled group run. Independent
                per-headset controls remain available on the Headsets page at all times.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">Mode</div>
                  <div className="mt-1 text-[12px] font-semibold capitalize text-[#111111]">
                    {group.mode === 'same' ? 'Same video' : 'Per headset'}
                  </div>
                </div>
                <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">Position</div>
                  <div className="mt-1 font-mono text-[12px] font-semibold text-[#111111]">
                    {formatTime(group.positionSeconds)}
                  </div>
                </div>
                <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">Headsets</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#111111]">
                    {group.devices.filter((device) => device.phase !== 'offline').length}/
                    {group.devices.length}
                  </div>
                </div>
                <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8A8A8A]">Lead time</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#111111]">
                    {(group.leadMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {group.message && (
                <div className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3.5 py-2.5 text-[11.5px] text-[#555555]">
                  {group.message}
                </div>
              )}

              <div className="overflow-hidden rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_thead_th]:border-b [&_thead_th]:border-white/50 [&_thead_th]:bg-white/35 [&_thead_th]:px-[18px] [&_thead_th]:py-3 [&_thead_th]:text-[9.5px] [&_thead_th]:font-bold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.14em] [&_thead_th]:text-[#475569] [&_tbody_td]:border-b [&_tbody_td]:border-white/40 [&_tbody_td]:px-[18px] [&_tbody_td]:py-[14px] [&_tbody_td]:align-middle [&_tbody_td]:text-[#334155] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#004CE4]/20 [&_tbody_tr:last-child_td]:border-b-0">
                    <thead>
                      <tr>
                        <th>Headset</th>
                        <th>Video</th>
                        <th>Phase</th>
                        <th>Position</th>
                        <th>Drift</th>
                        <th>Sync</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.devices.map((device) => (
                        <tr key={device.deviceId}>
                          <td className="font-semibold !text-[#111111]">
                            {device.deviceName}
                            {device.error && (
                              <div className="mt-0.5 text-[9.5px] font-normal text-[#B91C1C]">
                                {device.error}
                              </div>
                            )}
                          </td>
                          <td className="max-w-[180px] truncate">
                            {device.videoName ||
                              (device.videoId ? videoById.get(device.videoId)?.name : null) ||
                              '—'}
                          </td>
                          <td>
                            <span className={`inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] ${phaseTone(device.phase)}`}>
                              {PHASE_LABELS[device.phase]}
                            </span>
                          </td>
                          <td className="font-mono">{formatTime(device.positionSeconds)}</td>
                          <td className="font-mono">{driftLabel(device.driftMs)}</td>
                          <td className={`font-semibold ${healthStyle(device.syncHealth)}`}>
                            {device.syncHealth === 'unknown' ? '—' : device.syncHealth}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl bg-[#F5F5F5] px-3.5 py-2.5 text-[10.5px] leading-relaxed text-[#8A8A8A]">
                <Video className="mt-0.5 h-4 w-4 shrink-0 text-[#004CE4]" />
                <span>
                  Drift is measured from confirmed player reports, so values update at the heartbeat
                  interval. Sync is coordinated over the local network and is not frame-perfect; use
                  the drift and sync columns to judge each headset.
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
