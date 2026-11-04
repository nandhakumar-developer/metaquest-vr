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
    <div className="modal-backdrop">
      <div className="modal max-w-lg">
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <div className="modal-icon tint-lilac">
              <DownloadCloud className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="modal-title">Send video to headsets</h3>
              <p className="modal-sub max-w-[320px] truncate">“{video.name}”</p>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          {error && (
            <div className="alert alert-danger">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="alert alert-info text-[11px]">
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
                  <div key={deployment.id} className="panel-inset px-3.5 py-3">
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
                    <div className="progress mt-2">
                      <div
                        className={`progress-fill ${
                          deployment.status === 'ready'
                            ? 'is-success'
                            : deployment.status === 'failed'
                              ? 'is-danger'
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
            <span className="field-label !mb-0">Choose target headsets</span>
            <div className="flex items-center gap-2 text-[10.5px]">
              <button
                type="button"
                onClick={selectAllOnline}
                className="font-semibold text-[#462FF6] hover:text-[#B91C1C]"
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
            <div className="alert alert-warning text-[11px]">
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
                        ? 'cursor-pointer border-[#462FF6]/30 bg-[#EEEAFE]'
                        : 'cursor-pointer border-[#E1E1E1] bg-[#F5F5F5] hover:border-[#E1E1E1]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!selectable}
                      onChange={() => {}}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-[#111111]">
                        {device.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[#8A8A8A]">
                        <span>{device.model}</span>
                        <span className="text-[#E1E1E1]">·</span>
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
                  {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#462FF6]" />}
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

        <div className="modal-foot">
          <span className="flex items-center gap-1.5 text-[10px] text-[#8A8A8A]">
            <Clock className="h-3 w-3" />
            Keep the headset player open until its download finishes.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
              {submittedDeploymentIds.length > 0 ? 'Close' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleDeploy}
              disabled={loading || selectedDevices.length === 0 || submittedDeploymentIds.length > 0}
              className="btn btn-primary btn-sm"
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
