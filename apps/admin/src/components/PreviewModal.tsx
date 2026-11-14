import React from 'react';
import { useApp } from '../context/AppContext.js';
import {
  usePreviewCapturedAt,
  usePreviewDeviceId,
  usePreviewFrameData,
} from '../context/previewStore.js';
import { X, Eye, Activity } from 'lucide-react';

/**
 * Subscribes to the frame stream on its own so only this tiny node re-renders
 * at preview cadence. The modal shell (header, footer, buttons) stays stable
 * instead of reconciling the whole dialog 30 times per second.
 */
const PreviewImage: React.FC = () => {
  const frame = usePreviewFrameData();
  const capturedAt = usePreviewCapturedAt();

  return (
    <>
      {frame ? (
        <img
          src={`data:image/jpeg;base64,${frame}`}
          alt="Headset view"
          decoding="async"
          draggable={false}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="p-6 text-center text-[#8A8A8A]">
          <Activity className="mx-auto mb-2 h-8 w-8 animate-spin text-[#004CE4]" />
          <p className="text-[12px]">Waiting for the first headset snapshot…</p>
        </div>
      )}

      <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-[#2A2A2A]/70 px-2.5 py-1 font-mono text-[10px] text-white">
        Captured {capturedAt ? new Date(capturedAt).toLocaleTimeString() : '—'}
      </div>
    </>
  );
};

export const PreviewModal: React.FC = () => {
  const deviceId = usePreviewDeviceId();
  const { devices, closeActivePreview } = useApp();

  if (!deviceId) return null;

  const device = devices.find((d) => d.id === deviceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/45 p-5">
      <div className="flex max-h-[calc(100svh-40px)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/95 shadow-[0_32px_84px_rgba(0,0,0,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#004CE4]/20 text-[#004CE4]">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display truncate text-[15.5px] font-bold tracking-[-0.025em]">
                  Live view · {device?.name || 'Headset'}
                </h3>
                <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-[#20D9A5]/35 bg-[#20D9A5]/15 px-[9px] text-[10.5px] font-semibold tracking-[0.005em] text-[#08785D]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#20D9A5]" />
                  Live preview
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={closeActivePreview}
            className="inline-flex h-[30px] w-[30px] items-center justify-center whitespace-nowrap rounded-[9px] border border-transparent bg-white/35 p-0 text-[#334155] transition-all duration-200 hover:bg-white/65 hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-[22px]">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-black/20 bg-[#2A2A2A] shadow-inner">
            <PreviewImage />
          </div>
        </div>

        <div className="flex items-center justify-between gap-[14px] border-t border-white/60 bg-white/40 px-[22px] py-4">
          <span className="text-[10.5px] text-[#8A8A8A]">
            Snapshot preview updates while this view is open. Playback itself remains on the
            headset.
          </span>
          <button
            onClick={closeActivePreview}
            className="inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-transparent bg-white/65 px-[13px] text-[11.5px] font-semibold leading-none tracking-[-0.008em] text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-px hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4]"
          >
            Close view
          </button>
        </div>
      </div>
    </div>
  );
};
