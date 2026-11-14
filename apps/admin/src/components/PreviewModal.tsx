import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.js';
import { useActivePreview } from '../context/previewStore.js';
import { X, Eye, Activity } from 'lucide-react';

export const PreviewModal: React.FC = () => {
  const activePreview = useActivePreview();
  const { devices, closeActivePreview } = useApp();
  const imgRef = useRef<HTMLImageElement | null>(null);
  const pendingSrcRef = useRef<string | null>(null);
  const decodingRef = useRef(false);
  const generationRef = useRef(0);

  useEffect(() => {
    const frame = activePreview?.dataBase64;
    if (!frame) {
      // Modal closed or waiting for the first frame: stop the decode loop.
      generationRef.current += 1;
      pendingSrcRef.current = null;
      decodingRef.current = false;
      return;
    }
    const src = `data:image/jpeg;base64,${frame}`;
    const img = imgRef.current;
    if (!img || decodingRef.current) {
      // Keep only the newest frame while the previous one is still decoding;
      // this prevents a decode backlog from making the preview lag behind.
      pendingSrcRef.current = src;
      return;
    }
    decodingRef.current = true;
    const generation = generationRef.current;
    void (async () => {
      let next: string | null = src;
      while (next && generation === generationRef.current) {
        img.src = next;
        try {
          await img.decode();
        } catch {
          // A newer frame can invalidate the decode; the loop simply continues.
        }
        if (generation !== generationRef.current) return;
        next = pendingSrcRef.current;
        pendingSrcRef.current = null;
      }
      if (generation === generationRef.current) decodingRef.current = false;
    })();
  }, [activePreview?.dataBase64]);

  if (!activePreview) return null;

  const device = devices.find((d) => d.id === activePreview.deviceId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/25 p-5 backdrop-blur-2xl">
      <div className="flex max-h-[calc(100svh-40px)] w-full flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/75 shadow-[0_32px_84px_rgba(0,0,0,0.16)] backdrop-blur-[40px] max-w-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#004CE4]/20 text-[#004CE4]">
              <Eye className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-display text-[15.5px] font-bold tracking-[-0.025em] truncate">
                  Live view · {device?.name || 'Headset'}
                </h3>
                <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#20D9A5]/35 bg-[#20D9A5]/15 text-[#08785D]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#20D9A5]" />
                  Live preview
                </span>
              </div>
            </div>
          </div>
          <button onClick={closeActivePreview} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-[22px] space-y-4">
          <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-black/20 bg-[#2A2A2A] shadow-inner">
            {activePreview.dataBase64 ? (
              <img
                ref={imgRef}
                alt="Headset view"
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="p-6 text-center text-[#8A8A8A]">
                <Activity className="mx-auto mb-2 h-8 w-8 animate-spin text-[#004CE4]" />
                <p className="text-[12px]">Waiting for the first headset snapshot…</p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 rounded-full border border-white/15 bg-[#2A2A2A]/70 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
              Captured {new Date(activePreview.capturedAt).toLocaleTimeString()}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-[14px] border-t border-white/60 bg-white/40 px-[22px] py-4">
          <span className="text-[10.5px] text-[#8A8A8A]">
            Snapshot preview updates while this view is open. Playback itself remains on the headset.
          </span>
          <button onClick={closeActivePreview} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px]">
            Close view
          </button>
        </div>
      </div>
    </div>
  );
};
