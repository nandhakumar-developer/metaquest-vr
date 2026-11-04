import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Cloud, Wifi, LogOut, Shield } from 'lucide-react';
import { Navbar, type TabKey } from './Navbar.js';

interface HeaderProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const Header: React.FC<HeaderProps> = ({ currentTab, onSelectTab }) => {
  const { identity, cloud, logout } = useApp();

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
            <img src="/image.png" alt="Meta Quest" className="brand-logo" />
          </div>
          <div className="min-w-0">
            <div className="brand-name">VR Control Center</div>
          </div>
        </div>

        <Navbar currentTab={currentTab} onSelectTab={onSelectTab} />

        <div className="flex items-center gap-2.5">
          <div className="chip hidden lg:inline-flex">
            {cloud?.online ? (
              <Cloud className="h-3.5 w-3.5 text-white" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-white" />
            )}
            <span>{cloud?.online ? 'Cloud synced' : 'Local LAN active'}</span>
          </div>

          {identity && (
            <div className="ml-1 flex items-center gap-2.5 border-l border-[#E1E1E1] pl-3.5">
              <div className="hidden text-right md:block">
                <div className="max-w-[150px] truncate text-[11.5px] font-semibold text-white">
                  {identity.displayName || identity.email}
                </div>
                <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] font-medium capitalize text-white/75">
                  <Shield className="h-2.5 w-2.5" />
                  {identity.role}
                </div>
              </div>

              <div className="avatar">{initials || 'VR'}</div>

              <button
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                  className="btn btn-ghost btn-icon btn-icon-round text-white/80 hover:text-white"
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
