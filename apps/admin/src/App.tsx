import React, { useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useApp } from './context/AppContext.js';
import { Header } from './components/Header.js';
import type { TabKey } from './components/Navbar.js';
import { DevicesView } from './components/DevicesView.js';
import { GroupPlaybackView } from './components/GroupPlaybackView.js';
import { VideosView } from './components/VideosView.js';
import { PairingModal } from './components/PairingModal.js';
import { PreviewModal } from './components/PreviewModal.js';
import { BootstrapView } from './components/BootstrapView.js';
import { LoginView } from './components/LoginView.js';
import { Activity } from 'lucide-react';

export const App: React.FC = () => {
  const { isAuthenticated, needsBootstrap, loading, startPreview, gatewayConfig } = useApp();
  const [currentTab, setCurrentTab] = useState<TabKey>('devices');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [groupVideoId, setGroupVideoId] = useState<string | null>(null);

  const openGroupPlayback = (videoId?: string) => {
    setGroupVideoId(videoId ?? null);
    setCurrentTab('group');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-[#555555]">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-[#E1E1E1] bg-white shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <Activity className="h-6 w-6 animate-spin text-[#004CE4]" />
        </div>
        <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[#8A8A8A]">
          Initializing control center
        </span>
      </div>
    );
  }

  if (needsBootstrap && !gatewayConfig?.auth.supabase) {
    return <BootstrapView />;
  }

  if (!isAuthenticated) {
    return <LoginView />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="isolate min-h-screen bg-[#EEF2F6] bg-[url(/background.jpg)] bg-cover bg-center bg-fixed text-[#0F172A] max-[720px]:bg-scroll">
        <Header currentTab={currentTab} onSelectTab={setCurrentTab} />

        <main className="relative mx-auto w-full max-w-[1320px] px-7 pb-[72px] pt-[26px] max-[720px]:px-[18px] max-[720px]:pb-[60px] max-[720px]:pt-5">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="flex flex-col gap-[22px]"
            >
              {currentTab === 'devices' && (
                <DevicesView
                  onOpenPairing={() => setPairingModalOpen(true)}
                  onOpenPreview={(id) => void startPreview(id)}
                  onOpenGroup={() => openGroupPlayback()}
                />
              )}
              {currentTab === 'group' && <GroupPlaybackView initialVideoId={groupVideoId} />}
              {currentTab === 'videos' && <VideosView onOpenGroup={openGroupPlayback} />}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Global Modals */}
        <PairingModal isOpen={pairingModalOpen} onClose={() => setPairingModalOpen(false)} />
        <PreviewModal />
      </div>
    </MotionConfig>
  );
};
