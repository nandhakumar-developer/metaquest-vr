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
  const {
    videos,
    sendCommand,
    renameDevice,
    unpairDevice,
    deleteDevice,
  } = useApp();

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

  const runCommand = (type: CommandType, payload?: Record<string, unknown>) => {
    setControlError(null);
    void sendCommand(device.id, type, payload).catch((error: unknown) => {
      setControlError(error instanceof Error ? error.message : 'The headset did not accept the command.');
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

  return (
    <div className={`rounded-xl border transition flex flex-col justify-between overflow-hidden ${
      isOnline
        ? 'bg-slate-900/90 border-slate-700/80 shadow-lg shadow-black/40 hover:border-cyan-700/60'
        : 'bg-slate-950/60 border-slate-800/80 opacity-75'
    }`}>
      {/* Top Banner: Status, Name, Battery */}
      <div className="p-4 border-b border-slate-800 flex items-start justify-between relative">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-3.5 h-3.5 rounded-full ${
              isOnline
                ? isBuffering
                  ? 'bg-amber-400 shadow-sm shadow-amber-500/80 animate-pulse'
                  : 'bg-emerald-500 shadow-sm shadow-emerald-500/80 animate-pulse'
                : 'bg-slate-600'
            }`} />
          </div>

          <div>
            {isRenaming ? (
              <form onSubmit={handleRenameSubmit} className="flex items-center gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="bg-slate-800 text-white text-sm px-2 py-0.5 rounded border border-cyan-500 outline-none"
                  autoFocus
                />
                <button type="submit" className="text-xs text-cyan-400 font-semibold px-1">Save</button>
                <button type="button" onClick={() => setIsRenaming(false)} className="text-xs text-slate-400 px-1">Cancel</button>
              </form>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-white tracking-tight text-base">{device.name}</h3>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {device.model}
                </span>
                {isBrowserPlayer && (
                  <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800/70">
                    Browser
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1 font-mono">
                {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-slate-500" />}
                {device.ipAddress || 'No LAN IP'}
              </span>
              <span>•</span>
              <span className={`capitalize font-medium ${isBuffering ? 'text-amber-400' : 'text-slate-300'}`}>
                {isOnline ? (isBuffering ? 'Buffering' : device.playback.state) : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        {/* Battery & More Menu */}
        <div className="flex items-center gap-2">
          {device.batteryLevel !== null && (
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono font-medium border ${
              (device.batteryLevel ?? 0) > 20
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50'
                : 'bg-rose-950/40 text-rose-400 border-rose-900/50'
            }`}>
              {device.charging ? (
                <BatteryCharging className="w-3.5 h-3.5" />
              ) : (
                <Battery className="w-3.5 h-3.5" />
              )}
              <span>{device.batteryLevel}%</span>
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-20 text-xs">
                <button
                  onClick={() => {
                    setIsRenaming(true);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-200"
                >
                  Rename Headset
                </button>
                <button
                  onClick={() => {
                    void sendCommand(device.id, 'RELOAD_PLAYER');
                    setMenuOpen(false);
                  }}
                  disabled={!isOnline}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-slate-200 disabled:opacity-40"
                >
                  Reload Player
                </button>
                <button
                  onClick={() => {
                    void unpairDevice(device.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-amber-400"
                >
                  Unpair Device
                </button>
                <button
                  onClick={() => {
                    void deleteDevice(device.id);
                    setMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-700 text-rose-400"
                >
                  Delete Record
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Middle Section: Active Video & Timeline Scrubbing */}
      <div className="p-4 space-y-3">
        {/* Current Video Info */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-300 font-medium truncate max-w-[220px]">
            <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate">{device.playback.videoName || 'No video loaded'}</span>
          </div>
          <div className="text-slate-400 font-mono text-[11px]">
            {formatTime(currentPos)} / {formatTime(duration)}
          </div>
        </div>

        {/* Timeline Slider */}
        <div className="relative flex items-center">
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
            className="w-full cursor-pointer accent-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed"
          />
        </div>

        {/* Playback Transport Buttons */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => handleSeekDelta(-10)}
              disabled={!isOnline || !device.playback.videoId}
              title="Seek back 10 seconds"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!isOnline}
              title={isPlaying || isBuffering ? 'Pause' : 'Play'}
              className={`p-2.5 rounded-xl font-bold transition shadow-sm ${
                isPlaying || isBuffering
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                  : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
              } disabled:opacity-40`}
            >
              {isPlaying || isBuffering ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <button
              onClick={handleStop}
              disabled={!isOnline || !device.playback.videoId}
              title="Stop"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
            </button>

            <button
              onClick={() => handleSeekDelta(10)}
              disabled={!isOnline || !device.playback.videoId}
              title="Seek forward 10 seconds"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVolumeChange(device.playback.volume > 0 ? 0 : 0.8)}
              disabled={!isOnline}
              className="text-slate-400 hover:text-white transition disabled:opacity-40"
            >
              {device.playback.volume === 0 ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-slate-400" />
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
              className="w-16 h-1 accent-cyan-500 disabled:opacity-40"
            />
          </div>
        </div>

        {/* Select & Load Video Dropdown */}
        <div className="pt-2">
          <select
            disabled={!isOnline || videos.length === 0}
            value={device.playback.videoId || ''}
            onChange={(e) => handleLoadVideo(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 outline-none hover:border-slate-600 disabled:opacity-40 transition"
          >
            <option value="">Load video onto headset...</option>
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} ({formatTime(v.durationSeconds)}) [{v.projectionType.toUpperCase()}]
              </option>
            ))}
          </select>
          {controlError && (
            <p role="alert" className="mt-1.5 text-[11px] leading-snug text-rose-300">
              {controlError}
            </p>
          )}
        </div>
      </div>

      {/* Bottom Footer: Storage Info & Live View Trigger */}
      <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
          <span>Free: {formatBytes(device.storage.freeBytes)}</span>
        </div>

        <button
          onClick={() => onOpenPreview(device.id)}
          disabled={!isOnline}
          className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-cyan-950 hover:text-cyan-400 border border-slate-700 hover:border-cyan-800 text-slate-300 font-medium transition disabled:opacity-40"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Live View</span>
        </button>
      </div>
    </div>
  );
};

