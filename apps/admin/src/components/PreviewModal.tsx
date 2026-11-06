import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext.js';
import { useActivePreview } from '../context/previewStore.js';
import { X, Eye, Compass, Activity } from 'lucide-react';

export const PreviewModal: React.FC = () => {
  const activePreview = useActivePreview();
  const { devices, settings, closeActivePreview } = useApp();
  const [previewFps, setPreviewFps] = useState(0);
  const frameTimes = useRef<{ deviceId: string; timestamps: number[] }>({
    deviceId: '',
    timestamps: [],
  });

  useEffect(() => {
    if (!activePreview?.dataBase64) {
      frameTimes.current = { deviceId: '', timestamps: [] };
      setPreviewFps(0);
      return;
    }

    const timestamp = Date.parse(activePreview.capturedAt);
    if (!Number.isFinite(timestamp)) return;
    if (frameTimes.current.deviceId !== activePreview.deviceId) {
      frameTimes.current = { deviceId: activePreview.deviceId, timestamps: [] };
    }
    const timestamps = frameTimes.current.timestamps;
    if (timestamps[timestamps.length - 1] === timestamp) return;
    timestamps.push(timestamp);
    while (timestamps.length > 1 && timestamp - timestamps[0] > 2000) timestamps.shift();
    const elapsed = timestamp - timestamps[0];
    setPreviewFps(elapsed > 0 ? Math.round(((timestamps.length - 1) * 1000) / elapsed) : 0);
  }, [activePreview?.deviceId, activePreview?.capturedAt]);

  if (!activePreview) return null;

  const device = devices.find((d) => d.id === activePreview.deviceId);
  const rotation = activePreview.rotation;

  let pitch = 0;
  let yaw = 0;
  let roll = 0;
  if (rotation) {
    const { x, y, z, w } = rotation;
    const sinr_cosp = 2 * (w * x + y * z);
    const cosr_cosp = 1 - 2 * (x * x + y * y);
    roll = Math.round(Math.atan2(sinr_cosp, cosr_cosp) * (180 / Math.PI));

    const sinp = 2 * (w * y - z * x);
    pitch = Math.round(
      Math.abs(sinp) >= 1 ? (Math.sign(sinp) * Math.PI) / 2 : Math.asin(sinp) * (180 / Math.PI),
    );

    const siny_cosp = 2 * (w * z + x * y);
    const cosy_cosp = 1 - 2 * (y * y + z * z);
    yaw = Math.round(Math.atan2(siny_cosp, cosy_cosp) * (180 / Math.PI));
  }

  return (
    <div className="modal-backdrop">
      <div className="modal max-w-3xl">
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <div className="modal-icon tint-coral">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="modal-title truncate">
                  Live view · {device?.name || 'Headset'}
                </h3>
                <span className="badge badge-success">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#20D9A5]" />
                  Live preview
                </span>
              </div>
              <p className="modal-sub">
                Target {settings?.previewMaxFps ?? 12} FPS · Actual {previewFps || 'waiting'} FPS
              </p>
            </div>
          </div>
          <button onClick={closeActivePreview} className="btn btn-ghost btn-icon-sm" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-body space-y-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-black/20 bg-[#2A2A2A] shadow-inner">
            {activePreview.dataBase64 ? (
              <img
                src={`data:image/jpeg;base64,${activePreview.dataBase64}`}
                alt="Headset view"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="p-6 text-center text-[#8A8A8A]">
                <Activity className="mx-auto mb-2 h-8 w-8 animate-spin text-[#ED7109]" />
                <p className="text-[12px]">Waiting for the first headset snapshot…</p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-[#2A2A2A]/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
              Captured {new Date(activePreview.capturedAt).toLocaleTimeString()}
            </div>
          </div>

          <div className="panel-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-[#ED7109]" />
              <span className="text-[11.5px] font-semibold text-[#111111]">Headset orientation</span>
            </div>
            <div className="flex items-center gap-5 font-mono text-[11px]">
              <div className="flex items-center gap-1.5">
                <span className="text-[#8A8A8A]">Pitch</span>
                <span className="font-semibold text-[#555555]">{pitch}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#8A8A8A]">Yaw</span>
                <span className="font-semibold text-[#08785D]">{yaw}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[#8A8A8A]">Roll</span>
                <span className="font-semibold text-[#8A4B00]">{roll}°</span>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="text-[10.5px] text-[#8A8A8A]">
            Snapshot preview updates while this view is open. Playback itself remains on the headset.
          </span>
          <button onClick={closeActivePreview} className="btn btn-secondary btn-sm">
            Close view
          </button>
        </div>
      </div>
    </div>
  );
};
