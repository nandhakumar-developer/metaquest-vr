import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Glasses, Radio, Cloud, CloudOff, LogOut, Shield } from 'lucide-react';

export const Header: React.FC = () => {
  const { identity, wsConnected, cloud, logout } = useApp();

  const initials = (identity?.displayName || identity?.email || 'VR')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <div className="brand-mark">
            <Glasses className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div className="brand-name">VR Control Center</div>
            <div className="brand-caption">Quest fleet &amp; playback management</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="chip hidden sm:inline-flex">
            <span className={`status-dot ${wsConnected ? 'is-live' : 'is-off'}`} />
            <Radio className={`h-3.5 w-3.5 ${wsConnected ? 'text-[#3f9a77]' : 'text-[#c5544a]'}`} />
            <span>{wsConnected ? 'Gateway live' : 'Reconnecting'}</span>
          </div>

          <div className="chip hidden lg:inline-flex">
            {cloud?.online ? (
              <Cloud className="h-3.5 w-3.5 text-[#6c56a8]" />
            ) : (
              <CloudOff className="h-3.5 w-3.5 text-[#8b7d72]" />
            )}
            <span>{cloud?.online ? 'Cloud synced' : 'Local LAN mode'}</span>
          </div>

          {identity && (
            <div className="ml-1 flex items-center gap-2.5 border-l border-[#4a3e35]/10 pl-3.5">
              <div className="hidden text-right md:block">
                <div className="max-w-[150px] truncate text-[11.5px] font-semibold text-[#2a2320]">
                  {identity.displayName || identity.email}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium capitalize text-[#8b7d72]">
                  <Shield className="h-2.5 w-2.5" />
                  {identity.role}
                </div>
              </div>

              <div className="avatar">{initials || 'VR'}</div>

              <button
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                className="btn btn-ghost btn-icon btn-icon-round text-[#8b7d72] hover:text-[#c5544a]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
