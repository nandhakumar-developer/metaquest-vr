import React from 'react';
import { useApp } from '../context/AppContext.js';
import {
  Glasses,
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
    icon: React.FC<{ className?: string }>;
    badge?: number | string;
    badgeTone?: 'neutral' | 'live' | 'alert';
  }> = [
    {
      key: 'devices',
      label: 'Headsets',
      icon: Glasses,
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
    <nav className="primary-nav" aria-label="Primary">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = currentTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelectTab(tab.key)}
            className={`tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className={`h-4 w-4 ${active ? 'text-[#2A1B92]' : 'text-white/80'}`} />
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span
                className={`tab-badge ${
                  tab.badgeTone === 'live' ? 'is-live' : tab.badgeTone === 'alert' ? 'is-alert' : ''
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
};
