import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { DeviceCard } from './DeviceCard.js';
import {
  Glasses,
  Play,
  Pause,
  Square,
  Plus,
  AlertCircle,
  Search,
  CheckCircle2,
  Users,
  ArrowRight,
  WifiOff,
  Sparkles,
} from 'lucide-react';

interface DevicesViewProps {
  onOpenPairing: () => void;
  onOpenPreview: (deviceId: string) => void;
  onOpenGroup: () => void;
}

const ORB_BARS = [34, 58, 44, 76, 52, 90, 62, 70, 48, 82];

export const DevicesView: React.FC<DevicesViewProps> = ({
  onOpenPairing,
  onOpenPreview,
  onOpenGroup,
}) => {
  const { devices, pairingRequests, sendGroupCommand } = useApp();
  const [filter, setFilter] = useState<'all' | 'online' | 'playing'>('all');
  const [search, setSearch] = useState('');

  const onlineDevices = devices.filter((d) => d.online);
  const playingDevices = devices.filter((d) => d.online && d.playback.state === 'playing');

  const filteredDevices = devices.filter((device) => {
    if (filter === 'online' && !device.online) return false;
    if (filter === 'playing' && device.playback.state !== 'playing') return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        device.name.toLowerCase().includes(q) ||
        (device.ipAddress && device.ipAddress.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleGlobalPause = () => {
    const ids = onlineDevices.map((d) => d.id);
    if (ids.length > 0) void sendGroupCommand(ids, 'PAUSE');
  };

  const handleGlobalStop = () => {
    const ids = onlineDevices.map((d) => d.id);
    if (ids.length === 0) return;
    if (
      window.confirm(
        `Send STOP to all ${ids.length} online headset${ids.length === 1 ? '' : 's'}? This stops each headset independently.`,
      )
    ) {
      void sendGroupCommand(ids, 'STOP');
    }
  };

  return (
    <div className="page-stack">
      {/* Hero */}
      <section className="hero">
        <div className="hero-content">
          <span className="hero-eyebrow">
            <Sparkles className="h-3 w-3" />
            Live fleet operations
          </span>
          <h1 className="hero-title">
            Your fleet,
            <br />
            <span className="serif-accent">in focus.</span>
          </h1>
          <p className="hero-desc">
            Every Meta Quest 2 headset on one calm control surface. Pair, preview and cue
            synchronized playback without leaving your local network.
          </p>
          <div className="hero-actions">
            <button onClick={onOpenPairing} className="btn btn-primary">
              <Plus className="h-4 w-4" />
              Pair a headset
            </button>
            <button
              onClick={onOpenGroup}
              className="btn btn-secondary"
            >
              <Users className="h-4 w-4" />
              Group playback
              <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orb">
            <div className="hero-card">
              <div className="hero-card-label">
                <span className={`status-dot ${onlineDevices.length > 0 ? 'is-live' : 'is-off'}`} />
                Headsets online
              </div>
              <div className="hero-card-value">
                {onlineDevices.length}
                <small>/ {devices.length}</small>
              </div>
              <div className="hero-bars">
                {ORB_BARS.map((height, index) => (
                  <span key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="hero-card-meta">
                {playingDevices.length > 0
                  ? `${playingDevices.length} actively playing`
                  : 'All quiet on the network'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Total fleet</span>
            <span className="stat-icon tint-neutral">
              <Glasses className="h-4 w-4" />
            </span>
          </div>
          <div className="stat-value">{devices.length}</div>
          <div className="stat-hint">Paired Meta Quest 2</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Online</span>
            <span className="stat-icon tint-mint">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          </div>
          <div className="stat-value" style={{ color: '#347f63' }}>
            {onlineDevices.length}
          </div>
          <div className="stat-hint">Ready for commands</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Actively playing</span>
            <span className="stat-icon tint-coral">
              <Play className="h-4 w-4" />
            </span>
          </div>
          <div className="stat-value" style={{ color: '#d9533b' }}>
            {playingDevices.length}
          </div>
          <div className="stat-hint">Inside a VR experience</div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Offline</span>
            <span className="stat-icon tint-neutral">
              <WifiOff className="h-4 w-4" />
            </span>
          </div>
          <div className="stat-value" style={{ color: '#8b7d72' }}>
            {devices.length - onlineDevices.length}
          </div>
          <div className="stat-hint">Standby or powered off</div>
        </div>
      </div>

      {/* Pending pairing */}
      {pairingRequests.length > 0 && (
        <div className="alert alert-warning">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#c98a2e]/15 text-[#92601a]">
            <AlertCircle className="h-4 w-4 animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-[#7f571d]">
              {pairingRequests.length} headset{pairingRequests.length === 1 ? '' : 's'} requesting pairing
            </div>
            <p className="mt-0.5 text-[11.5px] text-[#7f571d]/85">
              A Meta Quest headset is waiting to join this gateway. Review the code to connect it.
            </p>
          </div>
          <button onClick={onOpenPairing} className="btn btn-dark btn-sm shrink-0">
            Review &amp; pair
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="toolbar">
        <div className="flex flex-wrap items-center gap-2">
          <span className="toolbar-label mr-1 hidden sm:inline">Fleet controls</span>
          <button
            onClick={onOpenGroup}
            disabled={onlineDevices.length === 0}
            title="Open synchronized group playback"
            className="btn btn-dark btn-sm"
          >
            <Users className="h-3.5 w-3.5" />
            Group playback
          </button>
          <button
            onClick={handleGlobalPause}
            disabled={onlineDevices.length === 0}
            className="btn btn-secondary btn-sm"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause all
          </button>
          <button
            onClick={handleGlobalStop}
            disabled={onlineDevices.length === 0}
            className="btn btn-secondary btn-sm"
          >
            <Square className="h-3 w-3" />
            Stop all
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="search-field w-full sm:w-52">
            <Search />
            <input
              type="text"
              placeholder="Search headsets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
            />
          </div>

          <div className="pill-group">
            <button
              onClick={() => setFilter('all')}
              className={`pill ${filter === 'all' ? 'is-active' : ''}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('online')}
              className={`pill ${filter === 'online' ? 'is-active' : ''}`}
            >
              Online
            </button>
            <button
              onClick={() => setFilter('playing')}
              className={`pill ${filter === 'playing' ? 'is-active' : ''}`}
            >
              Playing
            </button>
          </div>

          <button onClick={onOpenPairing} className="btn btn-primary btn-sm">
            <Plus className="h-4 w-4" />
            Pair headset
          </button>
        </div>
      </div>

      {/* Fleet grid */}
      {filteredDevices.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredDevices.map((device) => (
            <DeviceCard key={device.id} device={device} onOpenPreview={onOpenPreview} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <Glasses className="h-6 w-6" />
          </div>
          <h3 className="empty-title">No headsets found</h3>
          <p className="empty-desc">
            {devices.length === 0
              ? 'Pair your first Meta Quest 2 headset to begin independent playback control.'
              : 'No headsets match your current filter. Try a different view or search term.'}
          </p>
          {devices.length === 0 && (
            <button onClick={onOpenPairing} className="btn btn-primary btn-sm mt-5">
              <Plus className="h-4 w-4" />
              Pair first headset
            </button>
          )}
        </div>
      )}
    </div>
  );
};
