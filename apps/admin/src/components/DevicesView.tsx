import React, { useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { DeviceCard } from './DeviceCard.js';
import {
  Pause,
  Plus,
  AlertCircle,
  Search,
  Users,
  ArrowRight,
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

  return (
    <div className="flex flex-col gap-[22px]">
      {/* Hero */}
      <section className="relative mx-auto grid min-h-[232px] w-full max-w-[1170px] grid-cols-[minmax(260px,0.82fr)_minmax(0,1.18fr)] items-stretch gap-[30px] overflow-hidden rounded-[30px] border border-transparent bg-white/45 px-[26px] py-5 text-[#0F172A] shadow-[0_20px_48px_-10px_rgba(0,0,0,0.09),0_4px_16px_rgba(0,0,0,0.04)] backdrop-blur-[36px] transition-all duration-200 hover:-translate-y-0.5 max-[920px]:gap-[18px] max-[920px]:p-6 max-[720px]:grid-cols-1 max-[720px]:gap-[22px] max-[720px]:rounded-3xl max-[720px]:px-[22px] max-[720px]:py-[26px]">
        <div className="relative z-[2] flex max-w-[480px] flex-col items-start justify-center">
          <span className="inline-flex h-[27px] items-center gap-2 rounded-full border border-transparent bg-white/75 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-[#003BB5] shadow-[0_4px_14px_rgba(0,76,228,0.14)] backdrop-blur-[18px]">
            Live VR Video Experience
          </span>
          <h1 className="mt-3 mb-[9px] font-space-grotesk text-[clamp(32px,3.6vw,44px)] font-extrabold leading-[0.98] tracking-[-0.055em] text-[#0F172A] max-[720px]:text-[clamp(34px,10vw,44px)]">
            Explore new worlds 
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <button onClick={onOpenPairing} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)]">
              <Plus className="h-4 w-4" />
              Pair a headset
            </button>
            <button onClick={onOpenGroup} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-0.5 bg-white/70 text-[#0F172A] shadow-[0_0_10px_2px_rgba(15,23,42,0.10),0_3px_6px_rgba(15,23,42,0.08)] backdrop-blur-[18px] hover:bg-white/90 hover:shadow-[0_0_14px_3px_rgba(15,23,42,0.13),0_5px_10px_rgba(15,23,42,0.10)]">
              <Users className="h-4 w-4" />
              Group playback
              <ArrowRight className="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        </div>

        <div className="grid w-full max-w-[380px] grid-cols-2 content-center justify-self-end gap-2 max-[380px]:grid-cols-1">
          <div className="relative flex min-h-[76px] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-transparent bg-white/55 p-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-[28px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.09)]">
            <div className="text-[10.5px] font-semibold text-[#475569]">Total MetaQuest</div>
            <div className="mt-1 font-display text-2xl font-extrabold leading-none tracking-[-0.05em] text-[#0F172A]">{devices.length}</div>
          </div>

          <div className="relative flex min-h-[76px] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-transparent bg-white/55 p-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-[28px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.09)]">
            <div className="text-[10.5px] font-semibold text-[#475569]">Online</div>
            <div className="mt-1 font-display text-2xl font-extrabold leading-none tracking-[-0.05em] text-[#08785D]">
              {onlineDevices.length}
            </div>
          </div>

          <div className="relative flex min-h-[76px] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-transparent bg-white/55 p-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-[28px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.09)]">
            <div className="text-[10.5px] font-semibold text-[#475569]">Actively playing</div>
            <div className="mt-1 font-display text-2xl font-extrabold leading-none tracking-[-0.05em] text-[#004CE4]">
              {playingDevices.length}
            </div>
          </div>

          <div className="relative flex min-h-[76px] flex-col items-center justify-center overflow-hidden rounded-[20px] border border-transparent bg-white/55 p-2 text-center shadow-[0_8px_24px_rgba(0,0,0,0.06)] backdrop-blur-[28px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.09)]">
            <div className="text-[10.5px] font-semibold text-[#475569]">Offline</div>
            <div className="mt-1 font-display text-2xl font-extrabold leading-none tracking-[-0.05em] text-[#FF2525]">
              {devices.length - onlineDevices.length}
            </div>
          </div>
        </div>
      </section>

      {/* Pending pairing */}
      {pairingRequests.length > 0 && (
        <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#004CE4]/25 bg-[#004CE4]/10 text-[#003BB5]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#004CE4]/15 text-[#003BB5]">
            <AlertCircle className="h-4 w-4 animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] font-semibold text-[#003BB5]">
              {pairingRequests.length} headset{pairingRequests.length === 1 ? '' : 's'} requesting pairing
            </div>
            <p className="mt-0.5 text-[11.5px] text-[#003BB5]/85">
              A Meta Quest headset is waiting to join this gateway. Review the code to connect it.
            </p>
          </div>
          <button onClick={onOpenPairing} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px] shrink-0">
            Review &amp; pair
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-[14px] rounded-[22px] border border-transparent bg-white/50 px-[14px] py-3 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-[28px]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenGroup}
            disabled={onlineDevices.length === 0}
            title="Open synchronized group playback"
            className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-0.5 bg-white/70 text-[#0F172A] shadow-[0_0_10px_2px_rgba(15,23,42,0.10),0_3px_6px_rgba(15,23,42,0.08)] backdrop-blur-[18px] hover:bg-white/90 hover:shadow-[0_0_14px_3px_rgba(15,23,42,0.13),0_5px_10px_rgba(15,23,42,0.10)] h-8 gap-1.5 px-[13px] text-[11.5px]"
          >
            <Users className="h-3.5 w-3.5" />
            Group playback
          </button>
          <button
            onClick={handleGlobalPause}
            disabled={onlineDevices.length === 0}
            className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px]"
          >
            <Pause className="h-3.5 w-3.5" />
            Pause all
          </button>
          <div className="relative w-52 rounded-[22px] border border-transparent bg-white/50 shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-[28px] [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:left-[13px] [&_svg]:top-1/2 [&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:-translate-y-1/2 [&_svg]:text-[#0F172A] [&_input]:min-h-[38px] [&_input]:rounded-full [&_input]:pl-9">
            <Search />
            <input
              type="text"
              placeholder="Search headsets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-0.5 rounded-[22px] border border-transparent bg-white/50 p-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-[28px]">
            <button
              onClick={() => setFilter('all')}
              className={`inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full px-[13px] text-[11.5px] font-semibold text-[#475569] transition-all hover:bg-white/45 hover:text-[#0F172A] ${filter === 'all' ? 'border-transparent bg-white/90 text-[#004CE4] shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : ''}`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('online')}
              className={`inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full px-[13px] text-[11.5px] font-semibold text-[#475569] transition-all hover:bg-white/45 hover:text-[#0F172A] ${filter === 'online' ? 'border-transparent bg-white/90 text-[#004CE4] shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : ''}`}
            >
              Online
            </button>
            <button
              onClick={() => setFilter('playing')}
              className={`inline-flex h-[30px] items-center gap-[5px] whitespace-nowrap rounded-full px-[13px] text-[11.5px] font-semibold text-[#475569] transition-all hover:bg-white/45 hover:text-[#0F172A] ${filter === 'playing' ? 'border-transparent bg-white/90 text-[#004CE4] shadow-[0_4px_16px_rgba(0,0,0,0.08)]' : ''}`}
            >
              Playing
            </button>
          </div>

          <button onClick={onOpenPairing} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px]">
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
        <div className="rounded-[26px] border-[1.5px] border-dashed border-transparent bg-white/50 px-[26px] py-[54px] text-center shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
            <img src="/meta.png" alt="" className="h-10 w-10 object-contain" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">No headsets found</h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">
            {devices.length === 0
              ? 'Pair your first Meta Quest 2 headset to begin independent playback control.'
              : 'No headsets match your current filter. Try a different view or search term.'}
          </p>
          {devices.length === 0 && (
            <button onClick={onOpenPairing} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px] mt-5">
              <Plus className="h-4 w-4" />
              Pair first headset
            </button>
          )}
        </div>
      )}
    </div>
  );
};
