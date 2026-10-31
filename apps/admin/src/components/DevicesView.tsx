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
} from 'lucide-react';

interface DevicesViewProps {
  onOpenPairing: () => void;
  onOpenPreview: (deviceId: string) => void;
  onOpenGroup: () => void;
}

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
    <div className="space-y-6">
      {/* Pending Pairing Alert Banner */}
      {pairingRequests.length > 0 && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/80 to-slate-900 border border-amber-500/50 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertCircle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h4 className="font-semibold text-amber-300 text-sm">
                Headset Pairing Requested ({pairingRequests.length})
              </h4>
              <p className="text-xs text-slate-300">
                A Meta Quest headset is requesting to join the gateway control center.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPairing}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
          >
            Review & Pair
          </button>
        </div>
      )}

      {/* Top Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Fleet</span>
            <Glasses className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{devices.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Paired Meta Quest 2</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Online</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">{onlineDevices.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">Ready for commands</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-cyan-400">
            <span>Actively Playing</span>
            <Play className="w-4 h-4" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-400">{playingDevices.length}</div>
          <div className="text-[11px] text-slate-400 mt-1">In VR experience</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Offline</span>
            <Glasses className="w-4 h-4 text-slate-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-400">
            {devices.length - onlineDevices.length}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Standby / Powered off</div>
        </div>
      </div>

      {/* Control Bar: Global Sync Controls + Search & Pair */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs font-semibold uppercase text-slate-400 tracking-wider mr-2">
            Fleet controls:
          </span>
          <button
            onClick={onOpenGroup}
            disabled={onlineDevices.length === 0}
            title="Open synchronized group playback"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition disabled:opacity-40"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Group Playback…</span>
          </button>
          <button
            onClick={handleGlobalPause}
            disabled={onlineDevices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition disabled:opacity-40"
          >
            <Pause className="w-3.5 h-3.5 fill-current" />
            <span>Pause All</span>
          </button>
          <button
            onClick={handleGlobalStop}
            disabled={onlineDevices.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition disabled:opacity-40"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Stop All</span>
          </button>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search headsets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-lg pl-9 pr-3 py-1.5 outline-none focus:border-cyan-500 transition w-full sm:w-48"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 rounded ${filter === 'all' ? 'bg-slate-700 text-white font-medium' : 'text-slate-400'}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('online')}
              className={`px-2.5 py-1 rounded ${filter === 'online' ? 'bg-slate-700 text-emerald-400 font-medium' : 'text-slate-400'}`}
            >
              Online
            </button>
          </div>

          {/* Pair New Headset Button */}
          <button
            onClick={onOpenPairing}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Pair Headset</span>
          </button>
        </div>
      </div>

      {/* Headset Grid */}
      {filteredDevices.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onOpenPreview={onOpenPreview}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <Glasses className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Headsets Found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {devices.length === 0
              ? 'Pair your first Meta Quest 2 headset to begin independent playback control.'
              : 'No headsets match your current filter criteria.'}
          </p>
          {devices.length === 0 && (
            <button
              onClick={onOpenPairing}
              className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
            >
              Pair First Headset
            </button>
          )}
        </div>
      )}
    </div>
  );
};

