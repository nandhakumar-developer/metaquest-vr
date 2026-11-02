import React, { useEffect, useState } from 'react';
import type { DeploymentDto, DeviceSnapshot, VideoDto } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import { X, DownloadCloud, AlertCircle } from 'lucide-react';

interface DeployModalProps {
  video: VideoDto | null;
  isOpen: boolean;
  onClose: () => void;
}

const isBrowserPlayer = (appVersion: string | null | undefined) =>
  Boolean(appVersion?.includes('browser'));

/**
 * Browser players must be online to receive a download command because the
 * gateway talks to them over the live WebSocket. Native clients can be queued
 * while offline and will receive the deployment when they reconnect.
 */
const isSelectable = (device: DeviceSnapshot) =>
  device.status !== 'revoked' && (!isBrowserPlayer(device.appVersion) || device.online);

export const DeployModal: React.FC<DeployModalProps> = ({ video, isOpen, onClose }) => {
  const { devices, deployments, deployVideo } = useApp();
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [submittedDeployments, setSubmittedDeployments] = useState<DeploymentDto[]>([]);
  const [submittedDeploymentIds, setSubmittedDeploymentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedDeviceIds([]);
    setSubmittedDeployments([]);
    setSubmittedDeploymentIds([]);
    setError(null);
  }, [isOpen, video?.id]);

  if (!isOpen || !video) return null;

  const selectableDevices = devices.filter(isSelectable);
  const onlineDevices = selectableDevices.filter((device) => device.online);
  const selectedDevices = devices.filter(
    (device) => selectedDeviceIds.includes(device.id) && isSelectable(device),
  );
  const selectedBrowserCount = selectedDevices.filter((device) =>
    isBrowserPlayer(device.appVersion),
  ).length;
  const selectedNativeCount = selectedDevices.length - selectedBrowserCount;
  const visibleDeployments = submittedDeploymentIds.map(
    (deploymentId) =>
      deployments.find((deployment) => deployment.id === deploymentId) ??
      submittedDeployments.find((deployment) => deployment.id === deploymentId),
  ).filter((deployment): deployment is DeploymentDto => Boolean(deployment));
  const downloadsComplete =
    visibleDeployments.length > 0 && visibleDeployments.every((deployment) => deployment.status === 'ready');
  const actionLabel =
    selectedNativeCount > 0 && selectedBrowserCount > 0
      ? 'Send to Headsets'
      : selectedBrowserCount > 0
        ? 'Download to Headsets'
        : 'Start Deployment';
  const deviceName = (deviceId: string) =>
    devices.find((device) => device.id === deviceId)?.name ?? 'Headset';

  const toggleDevice = (id: string) => {
    const target = devices.find((device) => device.id === id);
    if (!target || !isSelectable(target)) return;
    setSelectedDeviceIds((prev) =>
      prev.includes(id) ? prev.filter((deviceId) => deviceId !== id) : [...prev, id],
    );
  };

  const selectAllOnline = () => {
    setSelectedDeviceIds(onlineDevices.map((device) => device.id));
  };

  const selectAll = () => {
    setSelectedDeviceIds(selectableDevices.map((device) => device.id));
  };

  const handleDeploy = async () => {
    if (selectedDevices.length === 0) {
      setError(
        selectableDevices.length === 0
          ? 'No selectable headsets. Open the player on an offline browser headset first, or pair a headset.'
          : 'Please select at least one headset.',
      );
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await deployVideo(
        video.id,
        selectedDevices.map((device) => device.id),
      );
      setSubmittedDeployments(result.deployments);
      setSubmittedDeploymentIds(result.deployments.map((deployment) => deployment.id));
      if (result.errors.length > 0) {
        const failedIds = new Set(result.errors.map((problem) => problem.deviceId));
        const failures = result.errors.map(
          (problem) => `${deviceName(problem.deviceId)}: ${problem.message}`,
        );
        setSelectedDeviceIds([...failedIds]);
        const succeeded = selectedDevices.length - failedIds.size;
        const succeededNote = succeeded > 0 ? ` ${succeeded} headset(s) queued successfully.` : '';
        setError(`${failures.join(' ')}${succeededNote}`);
        return;
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send the video to the selected headsets');
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
              <h3 className="font-bold text-white text-base">Send Video to Headsets</h3>
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

          <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-900/60 text-xs leading-relaxed text-cyan-100/90">
            <strong className="text-cyan-200">Download to Quest storage:</strong> the selected player
            saves a verified local copy and shows its download progress in the headset's Downloads
            panel. Library streaming remains available separately.
          </div>

          {visibleDeployments.length > 0 && (
            <div className="space-y-2" aria-live="polite">
              {visibleDeployments.map((deployment) => {
                const percent = Math.round(deployment.progress * 100);
                const transferActive = ['queued', 'pending', 'downloading', 'verifying'].includes(
                  deployment.status,
                );
                const statusLabel =
                  deployment.status === 'ready'
                    ? 'Saved on headset'
                    : deployment.status === 'downloading'
                      ? `Downloading ${percent}%`
                      : deployment.status === 'verifying'
                        ? 'Verifying local copy'
                      : deployment.status === 'failed'
                        ? `Failed: ${deployment.error || 'Download could not be saved'}`
                        : deployment.status === 'queued'
                          ? 'Waiting for headset connection'
                          : deployment.status === 'cancelled'
                            ? 'Download cancelled'
                            : 'Starting download';
                return (
                  <div key={deployment.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-white">{deployment.deviceName}</span>
                      <span className={
                        deployment.status === 'ready'
                          ? 'text-emerald-400'
                          : deployment.status === 'failed'
                            ? 'text-rose-400'
                            : 'text-cyan-300'
                      }>
                        {transferActive && <DownloadCloud className="inline w-3 h-3 mr-1 animate-pulse" />}
                        {statusLabel}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          deployment.status === 'ready'
                            ? 'bg-emerald-500'
                            : deployment.status === 'failed'
                              ? 'bg-rose-500'
                              : 'bg-cyan-500'
                        } ${transferActive ? 'animate-pulse' : ''}`}
                        style={{
                          width: `${
                            transferActive && percent === 0
                              ? 28
                              : Math.max(0, Math.min(100, percent))
                          }%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div hidden={submittedDeploymentIds.length > 0} className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300">Choose Target Headsets:</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAllOnline}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
              >
                Select Online ({onlineDevices.length})
              </button>
              <span className="text-slate-600">|</span>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-slate-400 hover:text-white"
              >
                Select All ({selectableDevices.length})
              </button>
            </div>
          </div>

          {selectableDevices.length === 0 && submittedDeploymentIds.length === 0 && (
            <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs">
              No headsets are selectable right now. Open the player page on a browser headset so it
              comes online, then try again.
            </div>
          )}

          <div hidden={submittedDeploymentIds.length > 0} className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {devices.map((device) => {
              const browser = isBrowserPlayer(device.appVersion);
              const selectable = isSelectable(device);
              const checked = selectedDeviceIds.includes(device.id);
              return (
                <div
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  aria-disabled={!selectable}
                  className={`p-3 rounded-xl border flex items-center justify-between transition ${
                    !selectable
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
                      disabled={!selectable}
                      onChange={() => {}} // handled by parent div click
                      className="accent-cyan-500 rounded"
                    />
                    <div>
                      <div className="text-sm font-semibold">{device.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2">
                        <span>{device.model}</span>
                        <span>|</span>
                        <span className={device.online ? 'text-emerald-400' : 'text-slate-500'}>
                          {device.online ? 'Online' : 'Offline'}
                        </span>
                        <span className={browser ? 'text-cyan-400/80' : 'text-slate-400'}>
                          {browser
                            ? device.online
                              ? 'Browser player - saves to on-headset storage'
                              : 'Browser player - open it to receive downloads'
                            : 'Native client - downloads the file'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            Browser players download the video to local Quest Browser storage and show it under
            "On this headset". Playback from the shared video library remains a separate streaming
            option. Available browser storage is checked when reported; if space is unavailable,
            the transfer status shows the storage error.
          </p>

          <div className="pt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-500">
              Keep the headset player open until its download finishes.
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                {submittedDeploymentIds.length > 0 ? 'Close' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleDeploy}
                disabled={loading || selectedDevices.length === 0 || submittedDeploymentIds.length > 0}
                className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-900/30 flex items-center gap-1.5 disabled:opacity-50"
              >
                {loading ? (
                  'Sending...'
                ) : submittedDeploymentIds.length > 0 ? (
                  downloadsComplete ? 'Downloads complete' : 'Download started'
                ) : (
                  <>
                    <DownloadCloud className="w-4 h-4" /> {actionLabel} ({selectedDevices.length})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
