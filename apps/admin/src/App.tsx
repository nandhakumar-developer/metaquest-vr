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
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Activity className="w-8 h-8 animate-spin text-cyan-500" />
        <span className="text-xs font-mono">Initializing VR Control Center...</span>
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
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Header />
      <Navbar currentTab={currentTab} onSelectTab={setCurrentTab} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
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
      </main>

      {/* Global Modals */}
      <PairingModal
        isOpen={pairingModalOpen}
        onClose={() => setPairingModalOpen(false)}
      />
      <PreviewModal />
    </div>
  );
};

