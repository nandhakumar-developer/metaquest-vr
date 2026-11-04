import React, { useState, useRef } from 'react';
import type { ProjectionType, StereoLayout } from '@vrcc/shared-types';
import { getCsrfToken } from '../api/client.js';
import { X, Upload, Film, AlertCircle, CheckCircle2 } from 'lucide-react';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: () => void | Promise<void>;
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!videoName) {
        setVideoName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setSelectedFile(file);
      if (!videoName) {
        setVideoName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
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
    <div className="modal-backdrop">
      <div className="modal max-w-lg">
        <div className="modal-head">
          <div className="flex items-center gap-3">
            <div className="modal-icon tint-coral">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <h3 className="modal-title">Upload video to library</h3>
              <p className="modal-sub">Supported: MP4, MOV, MKV, WebM</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="btn btn-ghost btn-icon-sm"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="modal-body space-y-4">
            {error && (
              <div className="alert alert-danger">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="group cursor-pointer rounded-2xl border-[1.5px] border-dashed border-[#8A8A8A]/45 bg-[#F5F5F5] px-6 py-7 text-center transition hover:border-[#462FF6]/55 hover:bg-[#EEEAFE]"
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
                  <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl tint-coral transition group-hover:scale-105">
                    <Upload className="h-4.5 w-4.5" />
                  </span>
                  <div className="text-[12px] font-medium text-[#555555]">
                    Drag and drop a video, or{' '}
                    <span className="font-semibold text-[#462FF6]">browse</span>
                  </div>
                  <div className="mt-1 text-[10.5px] text-[#8A8A8A]">
                    Direct upload to local gateway storage
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="field-label">Video display title</label>
              <input
                type="text"
                placeholder="e.g. 360 Rollercoaster Ride"
                value={videoName}
                onChange={(e) => setVideoName(e.target.value)}
                className="input"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Projection type</label>
                <select
                  value={projectionType}
                  onChange={(e) => setProjectionType(e.target.value as ProjectionType)}
                  className="select"
                >
                  <option value="flat">Standard flat (2D)</option>
                  <option value="180">180° VR hemisphere</option>
                  <option value="360">360° VR spherical</option>
                </select>
              </div>

              <div>
                <label className="field-label">Stereoscopic layout</label>
                <select
                  value={stereoLayout}
                  onChange={(e) => setStereoLayout(e.target.value as StereoLayout)}
                  className="select"
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
                <div className="progress">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
          </div>

          <div className="modal-foot">
            <button type="button" onClick={onClose} disabled={isUploading} className="btn btn-ghost btn-sm">
              Cancel
            </button>
            <button type="submit" disabled={isUploading || !selectedFile} className="btn btn-primary btn-sm">
              {isUploading ? 'Uploading & inspecting…' : 'Upload video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
