import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CommandType, DeviceSnapshot } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Battery,
  BatteryCharging,
  Eye,
  Film,
  MoreVertical,
  Wifi,
  WifiOff,
  Glasses,
  Minimize,
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

export const DeviceCard: React.FC<DeviceCardProps> = ({ device, onOpenPreview }) => {
  const { videos, sendCommand, renameDevice, unpairDevice, deleteDevice } = useApp();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(device.name);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(device.playback.positionSeconds);
  const isSeekingRef = useRef(false);
  const lastSeekSentRef = useRef<number | null>(null);
  const pendingSeekRef = useRef<Promise<void> | null>(null);
  const [volumeValue, setVolumeValue] = useState(device.playback.volume);
  const isAdjustingVolumeRef = useRef(false);
  const pendingVolumeRef = useRef<number | null>(null);
  const volumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeCommandInFlightRef = useRef(false);
  const [controlError, setControlError] = useState<string | null>(null);
  const [playbackClock, setPlaybackClock] = useState(Date.now());

  useEffect(() => {
    if (!isSeekingRef.current) setSeekValue(device.playback.positionSeconds);
  }, [device.playback.positionSeconds]);

  useEffect(() => {
    if (
      !isAdjustingVolumeRef.current &&
      !volumeCommandInFlightRef.current &&
      volumeTimerRef.current === null
    ) {
      setVolumeValue(device.playback.volume);
    }
  }, [device.playback.volume]);

  useEffect(
    () => () => {
      if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !menuRef.current?.contains(event.target) &&
        !menuButtonRef.current?.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const closeOnViewportChange = () => setMenuOpen(false);

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [menuOpen]);

  const isOnline = device.online;
  const isPlaying = device.playback.state === 'playing';
  const isBuffering = device.playback.state === 'buffering';
  const duration = device.playback.durationSeconds || 100;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => setPlaybackClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  const reportedAt = Date.parse(device.playback.updatedAt);
  const elapsedSinceReport =
    isPlaying && Number.isFinite(reportedAt) ? Math.max(0, (playbackClock - reportedAt) / 1000) : 0;
  const projectedPosition = Math.min(
    duration,
    device.playback.positionSeconds + elapsedSinceReport,
  );
  const currentPos =
    isSeeking || pendingSeekRef.current ? seekValue : projectedPosition;
  const progressPercent = Math.max(0, Math.min(100, (currentPos / (duration || 1)) * 100));

  const runCommand = (type: CommandType, payload?: Record<string, unknown>): Promise<void> => {
    setControlError(null);
    return sendCommand(device.id, type, payload).catch((error: unknown) => {
      setControlError(
        error instanceof Error ? error.message : 'The headset did not accept the command.',
      );
    });
  };

  const handlePlayPause = async () => {
    if (!isOnline) return;
    if (pendingSeekRef.current) await pendingSeekRef.current;
    if (isPlaying || isBuffering) {
      runCommand('PAUSE');
    } else {
      if (!device.playback.videoId) {
        setControlError('Choose a video first.');
        return;
      }
      runCommand('PLAY');
    }
  };

  const handleSeekDelta = (deltaSeconds: number) => {
    if (!isOnline) return;
    const target = Math.max(0, Math.min(duration, currentPos + deltaSeconds));
    runCommand('SEEK', { positionSeconds: target });
  };

  const handleSeekCommit = (positionSeconds: number) => {
    if (!isOnline) return;
    isSeekingRef.current = false;
    setIsSeeking(false);
    setSeekValue(positionSeconds);
    if (lastSeekSentRef.current === positionSeconds) return;
    lastSeekSentRef.current = positionSeconds;
    const previousSeek = pendingSeekRef.current;
    const seekCommand = (previousSeek ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => runCommand('SEEK', { positionSeconds }));
    pendingSeekRef.current = seekCommand;
    void seekCommand.then(() => {
      if (pendingSeekRef.current === seekCommand) pendingSeekRef.current = null;
    });
  };

  const flushVolumeCommand = () => {
    if (volumeTimerRef.current !== null) {
      clearTimeout(volumeTimerRef.current);
      volumeTimerRef.current = null;
    }
    if (volumeCommandInFlightRef.current || pendingVolumeRef.current === null) return;

    const volume = pendingVolumeRef.current;
    pendingVolumeRef.current = null;
    volumeCommandInFlightRef.current = true;
    void runCommand('SET_VOLUME', { volume }).finally(() => {
      volumeCommandInFlightRef.current = false;
      if (pendingVolumeRef.current !== null) flushVolumeCommand();
    });
  };

  const handleVolumeChange = (vol: number) => {
    if (!isOnline) return;
    isAdjustingVolumeRef.current = true;
    setVolumeValue(vol);
    pendingVolumeRef.current = vol;
    if (volumeTimerRef.current !== null) clearTimeout(volumeTimerRef.current);
    volumeTimerRef.current = setTimeout(flushVolumeCommand, 120);
  };

  const finishVolumeAdjustment = () => {
    isAdjustingVolumeRef.current = false;
    flushVolumeCommand();
  };

  const requestImmersive = () => {
    if (!isOnline) return;
    runCommand('ENTER_IMMERSIVE');
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
      className={`relative flex flex-col overflow-hidden rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(0,0,0,0.1)] ${isOnline ? '' : 'opacity-[0.72] saturate-[0.75]'}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pb-3.5 pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <span
            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
              isOnline
                ? isBuffering
                  ? 'bg-[#004CE4] shadow-[0_0_0_4px_rgba(0,76,228,0.16)]'
                  : 'bg-[#20D9A5] shadow-[0_0_0_4px_rgba(32,217,165,0.15)]'
                : 'bg-[#8A8A8A]'
            }`}
          />

          <div className="min-w-0">
            {isRenaming ? (
              <form onSubmit={handleRenameSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45 h-8 min-h-8 w-40 px-2 text-[12px]"
                  autoFocus
                />
                <button type="submit" className="text-[11px] font-semibold text-[#004CE4]">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsRenaming(false)}
                  className="text-[11px] font-medium text-[#8A8A8A]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.02em] text-[#111111]">
                  {device.name}
                </h3>
                {!device.model.toLowerCase().includes('meta quest browser') && (
                  <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#E1E1E1] bg-[#F1F1F1] text-[#334155] font-mono text-[9.5px] uppercase tracking-[0.02em]">{device.model}</span>
                )}
              </div>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[#8A8A8A]">
              <span className="flex items-center gap-1 font-mono">
                {isOnline ? (
                  <Wifi className="h-3 w-3 text-[#20D9A5]" />
                ) : (
                  <WifiOff className="h-3 w-3 text-[#8A8A8A]" />
                )}
                {device.ipAddress || 'No LAN IP'}
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-[#E1E1E1]" />
              <span
                className={`font-medium capitalize ${
                  isBuffering ? 'text-[#003BB5]' : isOnline ? 'text-[#555555]' : 'text-[#8A8A8A]'
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
                  ? 'border-[#20D9A5]/20 bg-[#20D9A5]/10 text-[#08785D]'
                  : 'border-[#FF2525]/20 bg-[#FF2525]/10 text-[#B91C1C]'
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

          <div>
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => {
                if (!menuOpen) {
                  const rect = menuButtonRef.current?.getBoundingClientRect();
                  if (rect) {
                    const menuWidth = 176;
                    const estimatedMenuHeight = 164;
                    setMenuPosition({
                      top: rect.bottom + estimatedMenuHeight > window.innerHeight
                        ? Math.max(8, rect.top - estimatedMenuHeight - 4)
                        : rect.bottom + 4,
                      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
                    });
                  }
                }
                setMenuOpen((open) => !open);
              }}
              aria-label="Headset options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/70 p-0 text-[#334155] shadow-sm transition hover:bg-white hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4]"
            >
              <MoreVertical className="h-[18px] w-[18px]" strokeWidth={2.5} />
            </button>

            {menuOpen &&
              createPortal(
                <div
                  ref={menuRef}
                  role="menu"
                  style={{ top: menuPosition.top, left: menuPosition.left }}
                  className="fixed z-[100] w-44 overflow-hidden rounded-xl border border-[#E1E1E1] bg-white p-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.2)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIsRenaming(true);
                      setMenuOpen(false);
                    }}
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#555555] transition hover:bg-[#F1F1F1] hover:text-[#111111]"
                  >
                    Rename headset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void sendCommand(device.id, 'RELOAD_PLAYER');
                      setMenuOpen(false);
                    }}
                    disabled={!isOnline}
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#555555] transition hover:bg-[#F1F1F1] hover:text-[#111111] disabled:opacity-40"
                  >
                    Reload player
                  </button>
                  <div className="my-1 h-px bg-[#F1F1F1]" />
                  <button
                    type="button"
                    onClick={() => {
                      void unpairDevice(device.id);
                      setMenuOpen(false);
                    }}
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#003BB5] transition hover:bg-[#004CE4]/10"
                  >
                    Unpair device
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void deleteDevice(device.id);
                      setMenuOpen(false);
                    }}
                    role="menuitem"
                    className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[11.5px] font-medium text-[#B91C1C] transition hover:bg-[#FF2525]/10"
                  >
                    Delete record
                  </button>
                </div>,
                document.body,
              )}
          </div>
        </div>
      </div>

      {/* Now playing */}
      <div className="flex flex-1 flex-col gap-3 px-4 pb-4">
        <div className="rounded-[18px] border !border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] rounded-2xl bg-[#F5F5F5] px-3.5 py-3">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <div className="flex min-w-0 items-center gap-1.5 font-medium text-[#555555]">
              <Film className="h-3.5 w-3.5 shrink-0 text-[#004CE4]" />
              <span className="truncate">
                {device.playback.videoName || 'No video loaded'}
              </span>
            </div>
            <div className="shrink-0 font-mono text-[10.5px] text-[#8A8A8A]">
              {formatTime(currentPos)} / {formatTime(duration)}
            </div>
          </div>

          <div className="relative mt-1 h-8 touch-none">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 overflow-hidden rounded-full bg-[#E1E1E1]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#4E7EFF] to-[#004CE4]" style={{ width: `${progressPercent}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              disabled={!isOnline || !device.playback.videoId}
              value={currentPos}
              onChange={(e) => {
                isSeekingRef.current = true;
                setIsSeeking(true);
                setSeekValue(Number(e.target.value));
              }}
              onPointerDown={() => {
                isSeekingRef.current = true;
                lastSeekSentRef.current = null;
              }}
              onPointerUp={(e) => handleSeekCommit(Number(e.currentTarget.value))}
              onPointerCancel={(e) => handleSeekCommit(Number(e.currentTarget.value))}
              onKeyUp={(e) => {
                if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                  handleSeekCommit(Number(e.currentTarget.value));
                }
              }}
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent accent-[#004CE4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed [&::-webkit-slider-runnable-track]:h-[5px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:-mt-[4.5px] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#004CE4] [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.28)] [&::-moz-range-track]:h-[5px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#004CE4] [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(0,0,0,0.28)]"
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
              className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-[34px] w-[34px] rounded-[11px] p-0 rounded-full"
            >
              <span className="flex items-center gap-0.5"><RotateCcw className="h-3.5 w-3.5" /><span className="text-[9px] font-bold">10</span></span>
            </button>

            <button
              onClick={handlePlayPause}
              disabled={!isOnline || (!device.playback.videoId && !isPlaying)}
              title={isPlaying || isBuffering ? 'Pause playback' : 'Resume playback'}
              className={`inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px rounded-full ${
                isPlaying || isBuffering ? 'bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90' : 'bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)]'
              } h-10 w-10`}
            >
              {isPlaying || isBuffering ? (
                <Pause className="h-4 w-4 fill-current" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px] fill-current" />
              )}
            </button>

            <button
              onClick={() => handleSeekDelta(10)}
              disabled={!isOnline || !device.playback.videoId}
              title="Seek forward 10 seconds"
              className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-[34px] w-[34px] rounded-[11px] p-0 rounded-full"
            >
              <span className="flex items-center gap-0.5"><RotateCw className="h-3.5 w-3.5" /><span className="text-[9px] font-bold">10</span></span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleVolumeChange(device.playback.volume > 0 ? 0 : 0.8)}
              disabled={!isOnline}
              aria-label="Toggle mute"
              className="text-[#8A8A8A] transition hover:text-[#111111] disabled:opacity-40"
            >
              {device.playback.volume === 0 ? (
                <VolumeX className="h-4 w-4 text-[#FF2525]" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              disabled={!isOnline}
              value={volumeValue}
              onChange={(e) => handleVolumeChange(Number(e.target.value))}
              onPointerUp={finishVolumeAdjustment}
              onPointerCancel={finishVolumeAdjustment}
              onKeyUp={finishVolumeAdjustment}
              className="h-6 w-20 cursor-pointer appearance-none bg-transparent accent-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-runnable-track]:h-[5px] [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-[#E1E1E1] [&::-webkit-slider-thumb]:-mt-1 [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[13px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#004CE4] [&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,76,228,0.24)] [&::-moz-range-track]:h-[5px] [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-[#E1E1E1] [&::-moz-range-thumb]:h-[11px] [&::-moz-range-thumb]:w-[11px] [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#004CE4]"
              aria-label="Volume"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={requestImmersive}
            disabled={!isOnline || !device.playback.videoId}
            title="Request immersive VR; browser may require a tap on the headset"
            className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[#004CE4]/10 px-2.5 text-[10px] font-semibold text-[#003BB5] transition hover:bg-[#004CE4]/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Glasses className="h-3.5 w-3.5" />
            Request VR
          </button>
          <button
            onClick={() => runCommand('EXIT_IMMERSIVE')}
            disabled={!isOnline}
            title="Exit immersive VR on the headset"
            className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-white/70 px-2.5 text-[10px] font-semibold text-[#0F172A] shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minimize className="h-3.5 w-3.5" />
            Exit VR
          </button>
          <button
            onClick={() => runCommand('EXIT_FULLSCREEN')}
            disabled={!isOnline}
            title="Exit fullscreen on the headset"
            className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-white/70 px-2.5 text-[10px] font-semibold text-[#0F172A] shadow-[0_2px_8px_rgba(0,0,0,0.07)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minimize className="h-3.5 w-3.5" />
            Exit fullscreen
          </button>
        </div>

        <select
          disabled={!isOnline || videos.length === 0}
          value={device.playback.videoId || ''}
          onChange={(e) => handleLoadVideo(e.target.value)}
          className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45 min-h-[34px] rounded-[10px] py-0 pl-[11px] pr-8 text-[11.5px]"
        >
          <option value="">Load video onto headset…</option>
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} ({formatTime(v.durationSeconds)}) [{v.projectionType.toUpperCase()}]
            </option>
          ))}
        </select>

        {controlError && (
          <p role="alert" className="text-[11px] leading-snug text-[#B91C1C]">
            {controlError}
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-end border-t border-[#E1E1E1] bg-[#F5F5F5] px-4 py-2.5">
        <button
          onClick={() => onOpenPreview(device.id)}
          disabled={!isOnline}
          className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-[27px] gap-[5px] px-[10px] text-[10.5px]"
        >
          <Eye className="h-3.5 w-3.5" />
          Live view
        </button>
      </div>
    </article>
  );
};
