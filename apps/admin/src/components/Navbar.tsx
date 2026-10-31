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
    badgeColor?: string;
  }> = [
    {
      key: 'devices',
      label: 'Headsets',
      icon: Glasses,
      badge: pairingRequests.length > 0 ? `+${pairingRequests.length}` : `${onlineCount}/${devices.length}`,
      badgeColor: pairingRequests.length > 0 ? 'bg-amber-500 text-slate-950 font-bold animate-pulse' : 'bg-slate-800 text-slate-300',
    },
    {
      key: 'group',
      label: 'Group Playback',
      icon: Users,
      badge:
        group && group.status !== 'idle' && group.status !== 'stopped'
          ? group.status
          : undefined,
      badgeColor:
        group?.status === 'playing'
          ? 'bg-emerald-500 text-slate-950 font-bold'
          : group?.status === 'scheduled'
            ? 'bg-sky-500 text-slate-950 font-bold'
            : 'bg-amber-500 text-slate-950 font-bold',
    },
    {
      key: 'videos',
      label: 'Video Library',
      icon: Film,
      badge: videos.length > 0 ? videos.length : undefined,
      badgeColor: 'bg-slate-800 text-slate-300',
    },
    {
      key: 'deployments',
      label: 'Transfers & Deploy',
      icon: DownloadCloud,
      badge: activeDownloads > 0 ? activeDownloads : undefined,
      badgeColor: 'bg-cyan-500 text-slate-950 font-bold animate-pulse',
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
    <nav className="border-b border-slate-800 bg-slate-900/50 px-6">
      <div className="flex gap-2 overflow-x-auto py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = currentTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onSelectTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap ${
                active
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800/80 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${tab.badgeColor || 'bg-slate-800 text-slate-300'}`}
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

