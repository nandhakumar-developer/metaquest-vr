import React from 'react';
import { useApp } from '../context/AppContext.js';
import { Cloud, Wifi, LogOut } from 'lucide-react';
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
    <header className="sticky top-0 z-40 px-[14px] pt-6">
      <div className="mx-auto flex h-[60px] w-full max-w-[1120px] items-center justify-between gap-6 rounded-full border border-transparent bg-white/55 px-7 shadow-[0_12px_36px_rgba(0,0,0,0.08)] backdrop-blur-[32px] max-[720px]:px-[18px] max-[520px]:h-14 max-[520px]:gap-3">
        <div className="flex min-w-0 items-center gap-3 max-[520px]:gap-[9px]">
          <div className="grid h-[42px] w-[42px] shrink-0 place-items-center overflow-hidden rounded-[14px] border border-transparent bg-white text-[#004CE4] shadow-[0_4px_12px_rgba(0,0,0,0.06)] max-[520px]:h-9 max-[520px]:w-9 max-[520px]:rounded-xl">
            <img src="/image.png" alt="Meta Quest" className="block h-full w-full object-cover" />
          </div>
        </div>

        <div className="w-fit min-w-0 shrink max-[720px]:flex-1">
          <Navbar currentTab={currentTab} onSelectTab={onSelectTab} />
        </div>

        <div className="flex items-center gap-2.5">
          <div className="inline-flex h-[34px] items-center gap-[7px] whitespace-nowrap rounded-full border border-transparent bg-white/55 px-[13px] text-[11.5px] font-medium text-[#334155] shadow-sm backdrop-blur-2xl max-[520px]:h-[30px] max-[520px]:px-[10px] max-[520px]:text-[10.5px] hidden lg:inline-flex">
            {cloud?.online ? (
              <Cloud className="h-3.5 w-3.5 text-[#004CE4]" />
            ) : (
              <Wifi className="h-3.5 w-3.5 text-[#004CE4]" />
            )}
            <span>{cloud?.online ? 'Cloud synced' : 'Local LAN active'}</span>
          </div>

          {identity && (
            <div className="ml-1 flex items-center gap-2.5 border-l border-[#E1E1E1] pl-3.5">
              <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-transparent bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(0,76,228,0.28)]">{initials || 'VR'}</div>

              <button
                onClick={() => void logout()}
                title="Sign out"
                aria-label="Sign out"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-transparent bg-white/45 p-0 text-[#334155] backdrop-blur-[14px] transition hover:bg-white/75 hover:text-[#0F172A]"
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
