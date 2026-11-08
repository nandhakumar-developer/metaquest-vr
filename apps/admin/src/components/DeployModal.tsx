import React, { useEffect, useState } from 'react';
import type { DeploymentDto, DeviceSnapshot, VideoDto } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import { X, DownloadCloud, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

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
  const visibleDeployments = submittedDeploymentIds
    .map(
      (deploymentId) =>
        deployments.find((deployment) => deployment.id === deploymentId) ??
        submittedDeployments.find((deployment) => deployment.id === deploymentId),
    )
    .filter((deployment): deployment is DeploymentDto => Boolean(deployment));
  const downloadsComplete =
    visibleDeployments.length > 0 &&
    visibleDeployments.every((deployment) => deployment.status === 'ready');
  const actionLabel =
    selectedNativeCount > 0 && selectedBrowserCount > 0
      ? 'Send to headsets'
      : selectedBrowserCount > 0
        ? 'Download to headsets'
        : 'Start deployment';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/25 p-5 backdrop-blur-2xl">
      <div className="flex max-h-[calc(100svh-40px)] w-full flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/75 shadow-[0_32px_84px_rgba(0,0,0,0.16)] backdrop-blur-[40px] max-w-lg">
        <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#004CE4]/20 text-[#004CE4]">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-display text-[15.5px] font-bold tracking-[-0.025em]">Send video to headsets</h3>
              <p className="mt-[3px] text-[11.5px] text-[#64748B] max-w-[320px] truncate">“{video.name}”</p>
            </div>
          </div>
          <button onClick={onClose} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-[22px] space-y-4">
          {error && (
            <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#004CE4]/25 bg-[#004CE4]/20 text-[#004CE4] text-[11px]">
            <DownloadCloud className="h-4 w-4 shrink-0" />
            <span>
              <strong className="font-semibold">Download to Quest storage:</strong> the selected player
              saves a verified local copy and shows progress in the headset's Downloads panel. Library
              streaming remains available separately.
            </span>
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
                  <div key={deployment.id} className="rounded-[18px] border border-transparent bg-white/40 shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-[18px] px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="font-semibold text-[#111111]">{deployment.deviceName}</span>
                      <span
                        className={
                          deployment.status === 'ready'
                            ? 'text-[#08785D]'
                            : deployment.status === 'failed'
                              ? 'text-[#B91C1C]'
                              : 'text-[#555555]'
                        }
                      >
                        {transferActive && (
                          <DownloadCloud className="mr-1 inline h-3 w-3 animate-pulse" />
                        )}
                        {statusLabel}
                      </span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full bg-[#F1F1F1] mt-2">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r from-[#4E7EFF] to-[#004CE4] transition-[width] duration-300 ${
                          deployment.status === 'ready'
                            ? 'from-[#20D9A5] to-[#20D9A5]'
                            : deployment.status === 'failed'
                              ? 'from-[#FF2525] to-[#FF2525]'
                              : ''
                        } ${transferActive ? 'animate-pulse' : ''}`}
                        style={{
                          width: `${
                            transferActive && percent === 0 ? 28 : Math.max(0, Math.min(100, percent))
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
            <span className="mb-[7px] block text-[11.5px] font-semibold text-[#334155] !mb-0">Choose target headsets</span>
            <div className="flex items-center gap-2 text-[10.5px]">
              <button
                type="button"
                onClick={selectAllOnline}
                className="font-semibold text-[#004CE4] hover:text-[#B91C1C]"
              >
                Online ({onlineDevices.length})
              </button>
              <span className="text-[#E1E1E1]">/</span>
              <button
                type="button"
                onClick={selectAll}
                className="font-semibold text-[#8A8A8A] hover:text-[#111111]"
              >
                All ({selectableDevices.length})
              </button>
            </div>
          </div>

          {selectableDevices.length === 0 && submittedDeploymentIds.length === 0 && (
            <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#004CE4]/25 bg-[#004CE4]/10 text-[#003BB5] text-[11px]">
              No headsets are selectable right now. Open the player page on a browser headset so it
              comes online, then try again.
            </div>
          )}

          <div
            hidden={submittedDeploymentIds.length > 0}
            className="max-h-60 space-y-2 overflow-y-auto pr-1"
          >
            {devices.map((device) => {
              const browser = isBrowserPlayer(device.appVersion);
              const selectable = isSelectable(device);
              const checked = selectedDeviceIds.includes(device.id);
              return (
                <div
                  key={device.id}
                  onClick={() => toggleDevice(device.id)}
                  aria-disabled={!selectable}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                    !selectable
                      ? 'cursor-not-allowed border-[#E1E1E1] bg-[#F5F5F5] text-[#8A8A8A]'
                      : checked
                        ? 'cursor-pointer border-[#004CE4]/30 bg-[#EAF0FF]'
                        : 'cursor-pointer border-[#E1E1E1] bg-[#F5F5F5] hover:border-[#E1E1E1]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      className="h-[15px] w-[15px] cursor-pointer rounded-[5px] accent-[#004CE4]"
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => {}}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-[#111111]">
                        {device.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#8A8A8A]">
                        {!device.model.toLowerCase().includes('meta quest browser') && (
                          <>
                            <span>{device.model}</span>
                            <span className="text-[#E1E1E1]">·</span>
                          </>
                        )}
                        <span className={device.online ? 'text-[#08785D]' : 'text-[#8A8A8A]'}>
                          {device.online ? 'Online' : 'Offline'}
                        </span>
                        <span className="text-[#E1E1E1]">·</span>
                        <span>
                          {browser
                            ? device.online
                              ? 'Browser player — saves to headset'
                              : 'Browser player — open to receive'
                            : 'Native client — downloads the file'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#004CE4]" />}
                </div>
              );
            })}
          </div>

          <p className="text-[10px] leading-relaxed text-[#8A8A8A]">
            Browser players download the video to local Quest Browser storage and show it under “On
            this headset”. Playback from the shared library remains a separate streaming option.
            Available browser storage is checked when reported; if space is unavailable, the transfer
            status shows the storage error.
          </p>
        </div>

        <div className="flex items-center justify-between gap-[14px] border-t border-white/60 bg-white/40 px-[22px] py-4">
          <span className="flex items-center gap-1.5 text-[10px] text-[#8A8A8A]">
            <Clock className="h-3 w-3" />
            Keep the headset player open until its download finishes.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-8 gap-1.5 px-[13px] text-[11.5px]">
              {submittedDeploymentIds.length > 0 ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={loading || selectedDevices.length === 0 || submittedDeploymentIds.length > 0}
              className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px]"
            >
              {loading ? (
                'Sending…'
              ) : submittedDeploymentIds.length > 0 ? (
                downloadsComplete ? (
                  'Downloads complete'
                ) : (
                  'Download started'
                )
              ) : (
                <>
                  <DownloadCloud className="h-3.5 w-3.5" /> {actionLabel} ({selectedDevices.length})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
