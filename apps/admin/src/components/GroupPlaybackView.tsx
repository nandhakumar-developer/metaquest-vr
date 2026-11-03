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
      return 'text-[#347f63]';
    case 'fair':
      return 'text-[#92601a]';
    case 'poor':
      return 'text-[#a23f36]';
    default:
      return 'text-[#8091a5]';
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
    <div className="page-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Synchronized playback</span>
          <h1 className="page-title">
            Group <span className="serif-accent text-[#5B94D7]">playback</span>
          </h1>
          <p className="page-desc">
            Load each selected headset, wait for a confirmed ready report, then start every player on
            a shared future timestamp. Drift is monitored and corrected with controlled seeks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`badge ${statusTone} h-7 px-3 uppercase`}>
            {group?.status === 'idle' || !group ? 'Idle' : group.status}
          </span>
          {group && group.status !== 'idle' && group.status !== 'stopped' && (
            <button onClick={() => void handleStop()} disabled={busy} className="btn btn-danger btn-sm">
              <Square className="h-3 w-3" />
              Stop group
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="alert alert-success">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        <section className="panel panel-pad space-y-4 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#203248]">
              <span className="grid h-7 w-7 place-items-center rounded-lg tint-mint">
                <Glasses className="h-3.5 w-3.5" />
              </span>
              Headsets
            </h3>
            <span className="font-mono text-[10px] text-[#8091a5]">
              {selectedDevices.length}/{devices.length} selected
            </span>
          </div>

          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#8091a5]">{onlineDevices.length} online now</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllOnline}
                className="font-semibold text-[#d9533b] transition hover:text-[#b8493f]"
              >
                Select online
              </button>
              <span className="text-[#c3b6ab]">/</span>
              <button
                type="button"
                onClick={clearSelection}
                className="font-semibold text-[#8091a5] transition hover:text-[#203248]"
              >
                Clear
              </button>
            </div>
          </div>

          {devices.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#7189a4]/15 px-4 py-6 text-center text-[11px] text-[#8091a5]">
              Pair a headset first from the Headsets page.
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => {
                const checked = selectedIds.includes(device.id);
                return (
                  <div
                    key={device.id}
                    className={`rounded-xl border px-3 py-2.5 transition ${
                      device.online
                        ? checked
                          ? 'border-[#5B94D7]/30 bg-[#5B94D7]/[0.06]'
                          : 'border-[#7189a4]/[0.09] bg-white/35 hover:border-[#7189a4]/20'
                        : 'border-[#7189a4]/[0.06] bg-white/20 opacity-60'
                    }`}
                  >
                    <label className="flex cursor-pointer items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!device.online}
                        onChange={() => toggleDevice(device.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-semibold text-[#203248]">
                            {device.name}
                          </span>
                          {device.online ? (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-[#347f63]">
                              <span className="status-dot is-live !h-1.5 !w-1.5" />
                              Online
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wide text-[#90a0b2]">
                              <WifiOff className="h-3 w-3" /> Offline
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-[#8091a5]">
                          {device.model} · {device.ipAddress || 'No LAN IP'}
                        </div>

                        {mode === 'mixed' && checked && device.online && (
                          <select
                            value={perDeviceVideo[device.id] || sharedVideoId}
                            onChange={(event) => setDeviceVideo(device.id, event.target.value)}
                            className="select select-sm mt-2"
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

          <div className="space-y-3 border-t border-[#7189a4]/[0.075] pt-4">
            <div>
              <div className="field-label">Content mode</div>
              <div className="pill-group w-full">
                <button
                  type="button"
                  onClick={() => setMode('same')}
                  className={`pill flex-1 justify-center ${mode === 'same' ? 'is-active' : ''}`}
                >
                  Same video
                </button>
                <button
                  type="button"
                  onClick={() => setMode('mixed')}
                  className={`pill flex-1 justify-center ${mode === 'mixed' ? 'is-active' : ''}`}
                >
                  Per headset
                </button>
              </div>
            </div>

            {mode === 'same' && (
              <div>
                <label className="field-label">Video for the group</label>
                <select
                  value={sharedVideoId}
                  onChange={(event) => setSharedVideoId(event.target.value)}
                  className="select"
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
              <label className="field-label">Start lead time</label>
              <select
                value={leadMs}
                onChange={(event) => setLeadMs(Number(event.target.value))}
                className="select"
              >
                <option value={3000}>3 seconds</option>
                <option value={4000}>4 seconds</option>
                <option value={5000}>5 seconds</option>
                <option value={8000}>8 seconds</option>
                <option value={10000}>10 seconds</option>
              </select>
              <p className="field-hint">
                Longer lead time gives every headset time to finish buffering before the shared start
                timestamp.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleStart()}
              disabled={busy || videos.length === 0}
              className="btn btn-primary w-full"
            >
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
              <span>{busy ? 'Working…' : 'Load and schedule group start'}</span>
            </button>
            {videos.length === 0 && (
              <p className="text-[10.5px] text-[#92601a]">
                Upload a video to the library before starting group playback.
              </p>
            )}
          </div>
        </section>

        <section className="panel panel-pad space-y-4 xl:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-[13px] font-semibold text-[#203248]">
              <span className="grid h-7 w-7 place-items-center tint-lilac">
                <Gauge className="h-3.5 w-3.5" />
              </span>
              Run feedback
            </h3>
            {group?.scheduledStartAt && (
              <span className="flex items-center gap-1.5 font-mono text-[10px] text-[#8091a5]">
                <Clock3 className="h-3.5 w-3.5" />
                {scheduledInSeconds !== null
                  ? `Start in ${scheduledInSeconds.toFixed(1)}s`
                  : `Started ${new Date(group.scheduledStartAt).toLocaleTimeString()}`}
              </span>
            )}
          </div>

          {!group || group.status === 'idle' ? (
            <div className="rounded-2xl border border-dashed border-[#7189a4]/15 bg-white/25 px-6 py-12 text-center">
              <div className="empty-icon">
                <Users className="h-6 w-6" />
              </div>
              <h4 className="empty-title">No group run yet</h4>
              <p className="empty-desc">
                Select headsets, choose a video, and start a scheduled group run. Independent
                per-headset controls remain available on the Headsets page at all times.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="panel-inset px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8091a5]">Mode</div>
                  <div className="mt-1 text-[12px] font-semibold capitalize text-[#203248]">
                    {group.mode === 'same' ? 'Same video' : 'Per headset'}
                  </div>
                </div>
                <div className="panel-inset px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8091a5]">Position</div>
                  <div className="mt-1 font-mono text-[12px] font-semibold text-[#203248]">
                    {formatTime(group.positionSeconds)}
                  </div>
                </div>
                <div className="panel-inset px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8091a5]">Headsets</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#203248]">
                    {group.devices.filter((device) => device.phase !== 'offline').length}/
                    {group.devices.length}
                  </div>
                </div>
                <div className="panel-inset px-3 py-2.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-[#8091a5]">Lead time</div>
                  <div className="mt-1 text-[12px] font-semibold text-[#203248]">
                    {(group.leadMs / 1000).toFixed(1)}s
                  </div>
                </div>
              </div>

              {group.message && (
                <div className="panel-inset px-3.5 py-2.5 text-[11.5px] text-[#52677f]">
                  {group.message}
                </div>
              )}

              <div className="table-wrap">
                <div className="overflow-x-auto">
                  <table className="data-table">
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
                          <td className="font-semibold !text-[#203248]">
                            {device.deviceName}
                            {device.error && (
                              <div className="mt-0.5 text-[9.5px] font-normal text-[#a23f36]">
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
                            <span className={`badge ${phaseTone(device.phase)}`}>
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

              <div className="flex items-start gap-2 rounded-xl bg-white/30 px-3.5 py-2.5 text-[10.5px] leading-relaxed text-[#8091a5]">
                <Video className="mt-0.5 h-4 w-4 shrink-0 text-[#5B94D7]" />
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
