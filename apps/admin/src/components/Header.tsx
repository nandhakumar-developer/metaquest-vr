import React from 'react';
import { useApp } from '../context/AppContext.js';
import {
  Glasses,
  Radio,
  Cloud,
  CloudOff,
  User,
  LogOut,
  Shield,
} from 'lucide-react';

export const Header: React.FC = () => {
  const { identity, wsConnected, cloud, logout } = useApp();

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
          <Glasses className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-bold text-lg tracking-tight text-white">VR Control Center</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
              Quest 2
            </span>
          </div>
          <p className="text-xs text-slate-400">Headset Fleet & Playback Management</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Gateway WebSocket Status */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          <Radio
            className={`w-4 h-4 ${
              wsConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'
            }`}
          />
          <span className="text-slate-300">
            {wsConnected ? 'Gateway Live' : 'Reconnecting...'}
          </span>
        </div>

        {/* Cloud Sync Status */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
          {cloud?.online ? (
            <>
              <Cloud className="w-4 h-4 text-cyan-400" />
              <span className="text-slate-300">Cloud Synced</span>
            </>
          ) : (
            <>
              <CloudOff className="w-4 h-4 text-slate-400" />
              <span className="text-slate-400">Local LAN Mode</span>
            </>
          )}
        </div>

        {/* Identity & Logout */}
        {identity && (
          <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-300">
                <User className="w-4 h-4" />
              </div>
              <div className="hidden md:block">
                <div className="font-medium text-slate-200">{identity.displayName || identity.email}</div>
                <div className="text-[10px] text-cyan-400 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span className="capitalize">{identity.role}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => void logout()}
              title="Sign Out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

