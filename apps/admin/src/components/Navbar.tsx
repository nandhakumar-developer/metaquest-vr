import React from 'react';
import { motion } from 'framer-motion';
import { useApp } from '../context/AppContext.js';
import {
  Film,
  Users,
} from 'lucide-react';

export type TabKey = 'devices' | 'group' | 'videos';

interface NavbarProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { videos, group } = useApp();

  const tabs: Array<{
    key: TabKey;
    label: string;
    icon?: React.FC<{ className?: string }>;
    badge?: number | string;
    badgeTone?: 'neutral' | 'live' | 'alert';
  }> = [
    {
      key: 'devices',
      label: 'Headsets',
    },
    {
      key: 'group',
      label: 'Group Playback',
      icon: Users,
      badge:
        group && group.status !== 'idle' && group.status !== 'stopped'
          ? group.status
          : undefined,
      badgeTone: group?.status === 'playing' ? 'live' : 'neutral',
    },
    {
      key: 'videos',
      label: 'Video Library',
      icon: Film,
      badge: videos.length > 0 ? videos.length : undefined,
      badgeTone: 'neutral',
    },
  ];

  return (
    <nav className="flex w-fit min-w-0 flex-none items-center justify-center gap-1 overflow-x-auto [scrollbar-width:none] max-[720px]:w-full max-[720px]:flex-1 max-[520px]:justify-start max-[520px]:gap-0.5" aria-label="Primary">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = currentTab === tab.key;
        return (
          <motion.button
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            whileHover={{ scale: 1.025 }}
            whileTap={{ scale: 0.96 }}
            className={`relative inline-flex h-[38px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-transparent px-2.5 text-[12.5px] font-semibold tracking-[-0.008em] text-[#0F172A] transition-colors duration-200 hover:text-[#0F172A] max-[520px]:h-[34px] max-[520px]:gap-[5px] max-[520px]:px-2 max-[520px]:text-[10.5px] ${active ? 'text-[#004CE4]' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <motion.span
                layoutId="active-nav-tab"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full bg-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
              />
            )}
            {Icon ? (
              <Icon className={`relative z-10 h-4 w-4 ${active ? 'text-[#004CE4]' : 'text-[#0F172A]'}`} />
            ) : (
              <img src="/meta.png" alt="" className="relative z-10 h-5 w-5 rounded object-contain" />
            )}
            <span className="relative z-10">{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`relative z-10 inline-flex h-[18px] items-center rounded-full bg-[#004CE4]/20 px-[7px] font-mono text-[9.5px] font-semibold tracking-normal ${
                  tab.key === 'videos' ? 'text-[#0F172A]' : 'text-[#004CE4]'
                } ${
                  tab.badgeTone === 'live'
                    ? 'bg-[#20D9A5]/20 text-[#08785D]'
                    : tab.badgeTone === 'alert'
                      ? 'bg-[#004CE4] text-[#111111]'
                      : ''
                }`}
              >
                {tab.badge}
              </span>
            )}
          </motion.button>
        );
      })}
    </nav>
  );
};
