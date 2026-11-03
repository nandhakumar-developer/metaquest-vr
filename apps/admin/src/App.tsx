import React, { useState } from 'react';
import { useApp } from './context/AppContext.js';
import { Header } from './components/Header.js';
import { Navbar, type TabKey } from './components/Navbar.js';
import { DevicesView } from './components/DevicesView.js';
import { GroupPlaybackView } from './components/GroupPlaybackView.js';
import { VideosView } from './components/VideosView.js';
import { DeploymentsView } from './components/DeploymentsView.js';
import { SessionsView } from './components/SessionsView.js';
import { AuditLogView } from './components/AuditLogView.js';
import { SettingsView } from './components/SettingsView.js';
import { PairingModal } from './components/PairingModal.js';
import { PreviewModal } from './components/PreviewModal.js';
import { BootstrapView } from './components/BootstrapView.js';
import { LoginView } from './components/LoginView.js';
import { Activity } from 'lucide-react';

export const App: React.FC = () => {
  const { isAuthenticated, needsBootstrap, loading, startPreview } = useApp();
  const [currentTab, setCurrentTab] = useState<TabKey>('devices');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [groupVideoId, setGroupVideoId] = useState<string | null>(null);

  const openGroupPlayback = (videoId?: string) => {
    setGroupVideoId(videoId ?? null);
    setCurrentTab('group');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-[#5c4f46]">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/70 bg-white/50 shadow-[0_20px_45px_-25px_rgba(58,42,32,0.5)] backdrop-blur-md">
          <Activity className="h-6 w-6 animate-spin text-[#ee6a52]" />
        </div>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#8b7d72]">
          Initializing control center
        </span>
      </div>
    );
  }

  if (needsBootstrap) {
    return <BootstrapView />;
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <div className="min-h-screen">
      <Header />
      <Navbar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <main className="page">
        <div className="page-stack">
          {currentTab === 'devices' && (
            <DevicesView
              onOpenPairing={() => setPairingModalOpen(true)}
              onOpenPreview={(id) => void startPreview(id)}
              onOpenGroup={() => openGroupPlayback()}
            />
          )}
          {currentTab === 'group' && <GroupPlaybackView initialVideoId={groupVideoId} />}
          {currentTab === 'videos' && <VideosView onOpenGroup={openGroupPlayback} />}
          {currentTab === 'deployments' && <DeploymentsView />}
          {currentTab === 'sessions' && <SessionsView />}
          {currentTab === 'audit' && <AuditLogView />}
          {currentTab === 'settings' && <SettingsView />}
        </div>
      </main>

      {/* Global Modals */}
      <PairingModal isOpen={pairingModalOpen} onClose={() => setPairingModalOpen(false)} />
      <PreviewModal />
    </div>
  );
};
