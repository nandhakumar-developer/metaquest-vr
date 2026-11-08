import React, { useState, useRef } from 'react';
import type { ProjectionType, StereoLayout } from '@vrcc/shared-types';
import { getCsrfToken } from '../api/client.js';
import { X, Upload, Film, AlertCircle, CheckCircle2 } from 'lucide-react';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: () => void | Promise<void>;
}

function inferProjection(fileName: string): ProjectionType | null {
  const name = fileName.toLowerCase().replace(/[\s_.-]+/g, ' ');
  if (/(^|[^0-9])(360|vr360|equirect(angular)?|spherical)([^0-9]|$)/.test(name)) {
    return '360';
  }
  if (/(^|[^0-9])(180|vr180)([^0-9]|$)/.test(name)) {
    return '180';
  }
  return null;
}

function inferStereo(fileName: string): StereoLayout | null {
  const name = fileName.toLowerCase().replace(/[\s_.-]+/g, ' ');
  if (/(^| )(sbs|side by side|stereoscopic)( |$)/.test(name)) return 'sbs';
  if (/(^| )(ou|over under|top bottom|tb)( |$)/.test(name)) return 'ou';
  return null;
}

export const VideoUploadModal: React.FC<VideoUploadModalProps> = ({
  isOpen,
  onClose,
  onUploaded,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoName, setVideoName] = useState('');
  const [projectionType, setProjectionType] = useState<ProjectionType>('flat');
  const [stereoLayout, setStereoLayout] = useState<StereoLayout>('mono');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const applyFile = (file: File) => {
    setSelectedFile(file);
    if (!videoName) {
      setVideoName(file.name.replace(/\.[^/.]+$/, ''));
    }
    const projection = inferProjection(file.name);
    if (projection) setProjectionType(projection);
    const stereo = inferStereo(file.name);
    if (stereo) setStereoLayout(stereo);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) applyFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) applyFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please choose a video file to upload.');
      return;
    }

    try {
      setIsUploading(true);
      setError(null);
      setUploadProgress(10);
      const csrfToken = getCsrfToken();
      if (!csrfToken) {
        throw new Error('Your admin session has expired. Sign in again before uploading.');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('name', videoName.trim() || selectedFile.name);
      formData.append('projectionType', projectionType);
      formData.append('stereoLayout', stereoLayout);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/videos', true);
        xhr.withCredentials = true;
        xhr.setRequestHeader('x-vrcc-csrf', csrfToken);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 90);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setUploadProgress(100);
            resolve();
          } else {
            try {
              const res = JSON.parse(xhr.responseText);
              reject(new Error(res.error?.message || `Upload failed: HTTP ${xhr.status}`));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(formData);
      });

      setSelectedFile(null);
      setVideoName('');
      try {
        await onUploaded?.();
      } catch {
        // The upload succeeded; the live WebSocket event will add it to the list.
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to upload video');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/25 p-5 backdrop-blur-2xl">
      <div className="flex max-h-[calc(100svh-40px)] w-full flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/75 shadow-[0_32px_84px_rgba(0,0,0,0.16)] backdrop-blur-[40px] max-w-lg">
        <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
          <div className="flex items-center gap-3">
            <div className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] bg-[#004CE4]/20 text-[#004CE4]">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-[15.5px] font-bold tracking-[-0.025em]">Upload video to library</h3>
              <p className="mt-[3px] text-[11.5px] text-[#64748B]">Supported: MP4, MOV, MKV, WebM</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="overflow-y-auto p-[22px] space-y-4">
            {error && (
              <div className="flex items-start gap-[11px] rounded-2xl border p-[13px] px-4 text-[12px] leading-[1.6] [&_svg]:mt-px [&_svg]:shrink-0 border-[#FF2525]/25 bg-[#FF2525]/10 text-[#B91C1C]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-[1.5px] border-dashed border-[#8A8A8A]/45 bg-[#F5F5F5] px-6 py-7 text-center transition hover:border-[#004CE4]/55 hover:bg-[#EAF0FF]"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".mp4,.m4v,.mov,.mkv,.webm"
                className="hidden"
              />
              {selectedFile ? (
                <div className="flex flex-col items-center">
                  <CheckCircle2 className="mb-2 h-8 w-8 text-[#20D9A5]" />
                  <div className="max-w-xs truncate text-[12.5px] font-semibold text-[#111111]">
                    {selectedFile.name}
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#8A8A8A]">
                    {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-[#004CE4]/20 text-[#004CE4] transition group-hover:scale-105">
                    <Upload className="h-4.5 w-4.5" />
                  </span>
                  <div className="text-[12px] font-medium text-[#555555]">
                    Drag and drop a video, or{' '}
                    <span className="font-semibold text-[#004CE4]">browse</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#8A8A8A]">
                    Direct upload to local gateway storage
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Video display title</label>
              <input
                type="text"
                placeholder="e.g. 360 Rollercoaster Ride"
                value={videoName}
                onChange={(e) => setVideoName(e.target.value)}
                className="min-h-[42px] w-full rounded-[14px] border border-transparent bg-white/60 px-[14px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:bg-white/95 focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Projection type</label>
                <select
                  value={projectionType}
                  onChange={(e) => setProjectionType(e.target.value as ProjectionType)}
                  className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
                >
                  <option value="flat">Standard flat (2D)</option>
                  <option value="180">180° VR hemisphere</option>
                  <option value="360">360° VR spherical</option>
                </select>
              </div>

              <div>
                <label className="mb-[7px] block text-[11.5px] font-semibold text-[#334155]">Stereoscopic layout</label>
                <select
                  value={stereoLayout}
                  onChange={(e) => setStereoLayout(e.target.value as StereoLayout)}
                  className="min-h-[42px] w-full appearance-none rounded-[14px] border border-transparent bg-white/60 bg-[url(data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20viewBox=%270%200%2024%2024%27%20fill=%27none%27%20stroke=%27%238A8A8A%27%20stroke-width=%272.2%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27m6%209%206%206%206-6%27/%3E%3C/svg%3E)] bg-[position:right_13px_center] bg-no-repeat px-[14px] pr-[34px] text-[12.5px] text-[#0F172A] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none backdrop-blur-[16px] transition focus:border-[#004CE4] focus:ring-[3px] focus:ring-[#004CE4]/20 hover:border-[#004CE4]/45"
                >
                  <option value="mono">2D monoscopic</option>
                  <option value="sbs">3D side-by-side</option>
                  <option value="ou">3D over-under</option>
                </select>
              </div>
            </div>

            {isUploading && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between font-mono text-[10.5px] text-[#8A8A8A]">
                  <span>Uploading to gateway…</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-[5px] overflow-hidden rounded-full bg-[#F1F1F1]">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#4E7EFF] to-[#004CE4] transition-[width] duration-300" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-[14px] border-t border-white/60 bg-white/40 px-[22px] py-4">
            <button type="button" onClick={onClose} disabled={isUploading} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-8 gap-1.5 px-[13px] text-[11.5px]">
              Cancel
            </button>
            <button type="submit" disabled={isUploading || !selectedFile} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px]">
              {isUploading ? 'Uploading & inspecting…' : 'Upload video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
