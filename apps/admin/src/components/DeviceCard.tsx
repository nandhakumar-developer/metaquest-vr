import React, { useState } from 'react';
import type { CommandType, DeviceSnapshot } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import {
  Play,
  Pause,
  Square,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Battery,
  BatteryCharging,
  Eye,
  Film,
  HardDrive,
  MoreVertical,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface DeviceCardProps {
  device: DeviceSnapshot;
  onOpenPreview: (deviceId: string) => void;
}

function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return '--';
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(1)} GB`;
}

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onOpenPreview }) => {
  const { videos, sendCommand, renameDevice, unpairDevice, deleteDevice } = useApp();

  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(device.name);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(device.playback.positionSeconds);
  const [controlError, setControlError] = useState<string | null>(null);

  const isOnline = device.online;
  const isPlaying = device.playback.state === 'playing';
  const isBuffering = device.playback.state === 'buffering';
  const isBrowserPlayer = Boolean(device.appVersion?.includes('browser'));
  const duration = device.playback.durationSeconds || 100;
  const currentPos = isSeeking ? seekValue : device.playback.positionSeconds;
  const progressPercent = Math.max(0, Math.min(100, (currentPos / (duration || 1)) * 100));

  const runCommand = (type: CommandType, payload?: Record<string, unknown>) => {
    setControlError(null);
    void sendCommand(device.id, type, payload).catch((error: unknown) => {
      setControlError(
        error instanceof Error ? error.message : 'The headset did not accept the command.',
      );
    });
  };

  const handlePlayPause = () => {
    if (!isOnline) return;
    if (isPlaying || isBuffering) runCommand('PAUSE');
    else runCommand('PLAY');
  };

  const handleStop = () => {
    if (!isOnline) return;
    runCommand('STOP');
  };

  const handleSeekDelta = (deltaSeconds: number) => {
    if (!isOnline) return;
    const target = Math.max(0, Math.min(duration, device.playback.positionSeconds + deltaSeconds));
    runCommand('SEEK', { positionSeconds: target });
  };

  const handleSeekCommit = () => {
    if (!isOnline) return;
    setIsSeeking(false);
    runCommand('SEEK', { positionSeconds: seekValue });
  };

  const handleVolumeChange = (vol: number) => {
    if (!isOnline) return;
    runCommand('SET_VOLUME', { volume: vol });
  };

  const handleLoadVideo = (videoId: string) => {
    if (!isOnline || !videoId) return;
    runCommand('LOAD_VIDEO', { videoId, autoplay: false });
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim() && newName !== device.name) {
      await renameDevice(device.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const stateLabel = !isOnline
    ? 'Disconnected'
    : isBuffering
      ? 'Buffering'
      : device.playback.state;

  return (
    <article
      className={`panel panel-hover flex flex-col overflow-hidden ${isOnline ? '' : 'opacity-[0.72] saturate-[0.75]'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3.5 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              isOnline
                ? isBuffering
                  ? 'bg-[#e0a13f] shadow-[0_0_0_4px_rgba(224,161,63,0.16)]'
                  : 'bg-[#4aa880] shadow-[0_0_0_4px_rgba(74,168,128,0.15)]'
                : 'bg-[#c0b3a9]'
            }`}
          />

          <div className="min-w-0">
            {isRenaming ? (
              <form onSubmit={handleRenameSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="input h-8 min-h-8 w-40 px-2 text-[12px]"
                  autoFocus
                />
                <button type="submit" className="text-[11px] font-semibold text-[#d9533b]">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="text-[11px] font-medium text-[#8b7d72]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-[#2a2320]">
                  {device.name}
                </h3>
                <span className="badge badge-neutral badge-mono">{device.model}</span>
                {isBrowserPlayer && <span className="badge badge-info badge-mono">Browser</span>}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[#8b7d72]">
              <span className="flex items-center gap-1 font-mono">
                {isOnline ? (
                  <Wifi className="h-3 w-3 text-[#4e9e7e]" />
                ) : (
                  <WifiOff className="h-3 w-3 text-[#a99a90]" />
                )}
                {device.ipAddress || 'No LAN IP'}
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-[#c3b6ab]" />
              <span
                className={`font-medium capitalize ${
                  isBuffering ? 'text-[#92601a]' : isOnline ? 'text-[#5c4f46]' : 'text-[#8b7d72]'
                }`}
              >
                {stateLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {device.batteryLevel !== null && (
            <div
              className={`flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-mono text-[10.5px] font-medium ${
                (device.batteryLevel ?? 0) > 20
                  ? 'border-[#4e9e7e]/20 bg-[#4e9e7e]/10 text-[#347f63]'
                  : 'border-[#c5544a]/20 bg-[#c5544a]/10 text-[#a23f36]'
              }`}
            >
              {device.charging ? (
                <BatteryCharging className="h-3.5 w-3.5" />
              ) : (
                <Battery className="h-3.5 w-3.5" />
              )}
              <span>{device.batteryLevel}%</span>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Headset options"
              className="btn btn-ghost btn-icon-sm text-[#8b7d72]"
            >
              <MoreVertical className="h-4 w-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="panel absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden p-1.5 shadow-[0_24px_50px_-20px_rgba(58,42,32,0.45)]">
                  <button
                    onClick={() => {
                      setIsRenaming(true);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#5c4f46] transition hover:bg-[#4a3e35]/[0.06] hover:text-[#2a2320]"
                  >
                    Rename headset
                  </button>
                  <button
                    onClick={() => {
                      void sendCommand(device.id, 'RELOAD_PLAYER');
                      setMenuOpen(false);
                    }}
                    disabled={!isOnline}
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#5c4f46] transition hover:bg-[#4a3e35]/[0.06] hover:text-[#2a2320] disabled:opacity-40"
                  >
                    Reload player
                  </button>
                  <div className="my-1 h-px bg-[#4a3e35]/[0.08]" />
                  <button
                    onClick={() => {
                      void unpairDevice(device.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#92601a] transition hover:bg-[#c98a2e]/10"
                  >
                    Unpair device
                  </button>
                  <button
                    onClick={() => {
                      void deleteDevice(device.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#a23f36] transition hover:bg-[#c5544a]/10"
                  >
                    Delete record
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Now playing */}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="rounded-2xl border border-[#4a3e35]/[0.07] bg-white/35 px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-[#5c4f46]">
              <Film className="h-3.5 w-3.5 shrink-0 text-[#d9533b]" />
              <span className="truncate">
                {device.playback.videoName || 'No video loaded'}
              </span>
            </div>
            <div className="shrink-0 font-mono text-[10.5px] text-[#8b7d72]">
              {formatTime(currentPos)} / {formatTime(duration)}
            </div>
          </div>

          <div className="relative mt-3">
            <div className="progress">
              <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={1}
              disabled={!isOnline || !device.playback.videoId}
              value={currentPos}
              onChange={(e) => {
                setIsSeeking(true);
                setSeekValue(Number(e.target.value));
              }}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="Playback position"
            />
          </div>
        </div>

        {/* Transport */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleSeekDelta(-10)}
              disabled={!isOnline || !device.playback.videoId}
              title="Seek back 10 seconds"
              className="btn btn-secondary btn-icon btn-icon-round"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!isOnline}
              title={isPlaying || isBuffering ? 'Pause' : 'Play'}
              className={`btn btn-icon-round ${
                isPlaying || isBuffering ? 'btn-dark' : 'btn-primary'
              } h-10 w-10`}
            >
              {isPlaying || isBuffering ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px]" />
              )}
            </button>

            <button
              onClick={handleStop}
              disabled={!isOnline || !device.playback.videoId}
              title="Stop"
              className="btn btn-secondary btn-icon btn-icon-round"
            >
              <Square className="h-3 w-3" />
            </button>

            <button
              onClick={() => handleSeekDelta(10)}
              disabled={!isOnline || !device.playback.videoId}
              title="Seek forward 10 seconds"
              className="btn btn-secondary btn-icon btn-icon-round"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVolumeChange(device.playback.volume > 0 ? 0 : 0.8)}
              disabled={!isOnline}
              aria-label="Toggle mute"
              className="text-[#8b7d72] transition hover:text-[#2a2320] disabled:opacity-40"
            >
              {device.playback.volume === 0 ? (
                <VolumeX className="h-4 w-4 text-[#c5544a]" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              disabled={!isOnline}
              value={device.playback.volume}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              className="w-14"
              aria-label="Volume"
            />
          </div>
        </div>

        <select
          disabled={!isOnline || videos.length === 0}
          value={device.playback.videoId || ''}
          onChange={(e) => handleLoadVideo(e.target.value)}
          className="select select-sm"
        >
          <option value="">Load video onto headset…</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({formatTime(v.durationSeconds)}) [{v.projectionType.toUpperCase()}]
            </option>
          ))}
        </select>

        {controlError && (
          <p role="alert" className="text-[11px] leading-snug text-[#a23f36]">
            {controlError}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between border-t border-[#4a3e35]/[0.075] bg-white/25 px-4 py-2.5">
        <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#8b7d72]">
          <HardDrive className="h-3.5 w-3.5 text-[#a99a90]" />
          <span>Free {formatBytes(device.storage.freeBytes)}</span>
        </div>

        <button
          onClick={() => onOpenPreview(device.id)}
          disabled={!isOnline}
          className="btn btn-secondary btn-xs"
        >
          <Eye className="h-3.5 w-3.5" />
          Live view
        </button>
      </div>
    </article>
  );
};
