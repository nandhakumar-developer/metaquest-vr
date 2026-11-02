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

      // Using XMLHttpRequest for accurate upload progress
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
              <Film className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Upload Video to Library</h3>
              <p className="text-xs text-slate-400">Supported: MP4, MOV, MKV, WebM</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* File Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-cyan-500 rounded-xl p-6 text-center cursor-pointer bg-slate-950/50 transition group"
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
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                <div className="text-sm font-semibold text-white truncate max-w-xs">{selectedFile.name}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <Upload className="w-8 h-8 text-slate-500 group-hover:text-cyan-400 transition mb-2" />
                <div className="text-sm font-medium text-slate-300">
                  Drag and drop video file, or <span className="text-cyan-400 font-semibold">browse</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">Direct upload to local gateway storage</div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Video Display Title</label>
            <input
              type="text"
              placeholder="e.g. 360 Rollercoaster Ride"
              value={videoName}
              onChange={(e) => setVideoName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Projection Type</label>
              <select
                value={projectionType}
                onChange={(e) => setProjectionType(e.target.value as ProjectionType)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="flat">Standard Flat (2D Screen)</option>
                <option value="180">180° VR Hemisphere</option>
                <option value="360">360° VR Spherical</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Stereoscopic Layout</label>
              <select
                value={stereoLayout}
                onChange={(e) => setStereoLayout(e.target.value as StereoLayout)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none"
              >
                <option value="mono">2D Monoscopic</option>
                <option value="sbs">3D Side-by-Side (SBS)</option>
                <option value="ou">3D Over-Under (Top-Bottom)</option>
              </select>
            </div>
          </div>

          {isUploading && (
            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Uploading to gateway...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-200"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-900/30 disabled:opacity-50"
            >
              {isUploading ? 'Uploading & Inspecting...' : 'Upload Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

