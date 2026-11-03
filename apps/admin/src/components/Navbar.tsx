import React from 'react';
import { useApp } from '../context/AppContext.js';
import {
  Glasses,
  Film,
  DownloadCloud,
  History,
  FileText,
  Settings,
  Users,
} from 'lucide-react';

export type TabKey = 'devices' | 'group' | 'videos' | 'deployments' | 'sessions' | 'audit' | 'settings';

interface NavbarProps {
  currentTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab }) => {
  const { devices, videos, deployments, pairingRequests, group } = useApp();

  const onlineCount = devices.filter((d) => d.online).length;
  const activeDownloads = deployments.filter(
    (d) => d.status === 'downloading' || d.status === 'queued' || d.status === 'pending',
  ).length;

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
      badge: pairingRequests.length > 0 ? `+${pairingRequests.length}` : `${onlineCount}/${devices.length}`,
      badgeTone: pairingRequests.length > 0 ? 'alert' : 'neutral',
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
    {
      key: 'deployments',
      label: 'Transfers',
      icon: DownloadCloud,
      badge: activeDownloads > 0 ? activeDownloads : undefined,
      badgeTone: activeDownloads > 0 ? 'alert' : 'neutral',
    },
    {
      key: 'sessions',
      label: 'Playback History',
      icon: History,
    },
    {
      key: 'audit',
      label: 'Audit Log',
      icon: FileText,
    },
    {
      key: 'settings',
      label: 'Settings',
      icon: Settings,
    },
  ];

  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar-inner">
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
              <Icon className={`h-4 w-4 ${active ? 'text-[#f8f1e9]' : 'text-[#9a8b80]'}`} />
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
      </div>
    </nav>
  );
};
