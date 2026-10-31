import React, { useState } from 'react';
import type { VideoDto } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import { X, DownloadCloud, AlertCircle } from 'lucide-react';

interface DeployModalProps {
  video: VideoDto | null;
  isOpen: boolean;
  onClose: () => void;
}

export const DeployModal: React.FC<DeployModalProps> = ({ video, isOpen, onClose }) => {
  const { devices, deployVideo } = useApp();
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !video) return null;

  const isBrowserPlayer = (appVersion: string | null | undefined) =>
    Boolean(appVersion?.includes('browser'));
  const eligibleDevices = devices.filter((d) => !isBrowserPlayer(d.appVersion));
  const onlineDevices = eligibleDevices.filter((d) => d.online);

  const toggleDevice = (id: string) => {
    const target = devices.find((d) => d.id === id);
    if (!target || isBrowserPlayer(target.appVersion)) return;
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id],
    );
  };

  const selectAllOnline = () => {
    setSelectedDeviceIds(onlineDevices.map((d) => d.id));
  };

  const selectAll = () => {
    setSelectedDeviceIds(eligibleDevices.map((d) => d.id));
  };

  const handleDeploy = async () => {
    if (selectedDeviceIds.length === 0) {
      setError(
        eligibleDevices.length === 0
          ? 'No native Quest client is paired. Browser players stream from the library directly and do not need a deployment.'
          : 'Please select at least one native Quest client to deploy to.',
      );
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await deployVideo(video.id, selectedDeviceIds);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to deploy video');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Deploy Video to Headsets</h3>
              <p className="text-xs text-slate-400 truncate max-w-sm">"{video.name}"</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Choose Target Headsets:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllOnline}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                Select Online ({onlineDevices.length})
              </button>
              <span className="text-slate-600">•</span>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-slate-400 hover:text-white"
              >
                Select All
              </button>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {devices.map((device) => {
              const browser = isBrowserPlayer(device.appVersion);
              const checked = selectedDeviceIds.includes(device.id);
              return (
                <div
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  aria-disabled={browser}
                  className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    browser
                      ? 'bg-slate-950/50 border-slate-800/60 text-slate-500 cursor-not-allowed'
                      : checked
                        ? 'bg-cyan-950/40 border-cyan-700 text-white cursor-pointer'
                        : 'bg-slate-800/50 border-slate-700/60 text-slate-300 hover:bg-slate-800 cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={browser}
                      onChange={() => {}} // handled by parent div click
                      className="accent-cyan-500 rounded"
                    />
                    <div>
                      <div className="text-sm font-semibold">{device.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span>{device.model}</span>
                        <span>•</span>
                        <span className={device.online ? 'text-emerald-400' : 'text-slate-500'}>
                          {device.online ? 'Online' : 'Offline'}
                        </span>
                        {browser && (
                          <span className="text-cyan-400/80">Browser player — streams directly</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            Native Quest clients download the file directly from the gateway over LAN HTTP range requests, and
            checksums are verified on completion. Browser players stream from the library and are not deployment
            targets.
          </p>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={loading || selectedDeviceIds.length === 0}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-900/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading ? 'Queuing...' : <><DownloadCloud className="w-4 h-4" /> Start Deployment ({selectedDeviceIds.length})</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

