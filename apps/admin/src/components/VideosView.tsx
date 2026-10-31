import React, { useState } from 'react';
import type { VideoDto } from '@vrcc/shared-types';
import { useApp } from '../context/AppContext.js';
import { VideoUploadModal } from './VideoUploadModal.js';
import { DeployModal } from './DeployModal.js';
import {
  Film,
  Plus,
  Play,
  DownloadCloud,
  Trash2,
  HardDrive,
  Clock,
  Layers,
  Users,
  Info,
  X,
} from 'lucide-react';

interface VideosViewProps {
  onOpenGroup: (videoId?: string) => void;
}

function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '--:--';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const VideosView: React.FC<VideosViewProps> = ({ onOpenGroup }) => {
  const { videos, deleteVideo } = useApp();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deployTarget, setDeployTarget] = useState<VideoDto | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoDto | null>(null);

  const handleDelete = async (videoId: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete video "${name}" from the gateway library?`)) {
      await deleteVideo(videoId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Film className="w-5 h-5 text-cyan-400" />
            Video Media Library ({videos.length})
          </h2>
          <p className="text-xs text-slate-400">
            Stored on this gateway and streamed on demand to Quest headsets running the browser player
          </p>
        </div>

        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition shadow-lg shadow-cyan-900/30"
        >
          <Plus className="w-4 h-4" />
          <span>Upload Video</span>
        </button>
      </div>

      <div className="flex items-start gap-2 p-3 rounded-xl bg-cyan-950/30 border border-cyan-900/60 text-[11px] leading-relaxed text-cyan-100/90">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-cyan-400" />
        <span>
          Browser players stream directly from this gateway over the LAN using HTTP range requests, so no
          download step is required. Use <strong className="text-cyan-200">Group Play</strong> to load a video on one
          or more headsets on a shared start timestamp, or pick a video from a headset card on the Headsets page for
          independent playback. <strong className="text-cyan-200">Native Deploy</strong> only applies to an optional
          native Quest client; browser players ignore download commands.
        </span>
      </div>

      {/* Video Grid */}
      {videos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div
              key={video.id}
              className="rounded-xl border border-slate-800 bg-slate-900/90 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition shadow-lg shadow-black/40"
            >
              {/* Thumbnail / Header */}
              <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800">
                {video.thumbnailPath ? (
                  <img
                    src={`/api/videos/${video.id}/thumbnail`}
                    alt={video.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Film className="w-12 h-12 text-slate-700" />
                )}

                {/* Badges on Thumbnail */}
                <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-900/90 text-cyan-400 border border-cyan-800 backdrop-blur">
                    {video.projectionType.toUpperCase()} VR
                  </span>
                  {video.stereoLayout !== 'mono' && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-900/90 text-amber-400 border border-amber-800 backdrop-blur">
                      3D {video.stereoLayout.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="absolute bottom-2.5 right-2.5 bg-black/80 backdrop-blur text-white font-mono text-[11px] px-2 py-0.5 rounded">
                  {formatSeconds(video.durationSeconds)}
                </div>

                {/* Quick play hover button */}
                <button
                  onClick={() => setPreviewVideo(video)}
                  title="Stream preview"
                  className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 flex items-center justify-center transition backdrop-blur-xs text-white"
                >
                  <div className="w-12 h-12 rounded-full bg-cyan-500/90 flex items-center justify-center shadow-lg shadow-cyan-900/50">
                    <Play className="w-6 h-6 fill-current text-slate-950 ml-0.5" />
                  </div>
                </button>
              </div>

              {/* Video Info */}
              <div className="p-4 space-y-3">
                <div>
                  <h3 className="font-semibold text-white text-sm truncate" title={video.name}>
                    {video.name}
                  </h3>
                  <div className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                    {video.originalFilename}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatBytes(video.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    <span>{formatSeconds(video.durationSeconds)}</span>
                  </div>
                  {video.width && video.height && (
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      <span>{video.width}x{video.height} {video.frameRate ? `@ ${video.frameRate} fps` : ''} ({video.videoCodec || 'H.264'})</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Footer Actions */}
              <div className="p-3 bg-slate-950/80 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenGroup(video.id)}
                    title="Open synchronized group playback with this video preselected"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800 font-semibold text-xs transition"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Group Play</span>
                  </button>
                  <button
                    onClick={() => setDeployTarget(video)}
                    title="Download to the optional native Quest client. Browser players stream directly."
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-800 font-semibold text-xs transition"
                  >
                    <DownloadCloud className="w-3.5 h-3.5" />
                    <span>Native Deploy</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewVideo(video)}
                    title="Play Preview"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                  >
                    <Play className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void handleDelete(video.id, video.name)}
                    title="Delete Video"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <Film className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Videos Uploaded</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Upload your 360°, 180°, or flat VR video files to the gateway to deploy them to Meta Quest 2 headsets.
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
          >
            Upload First Video
          </button>
        </div>
      )}

      {/* Upload Modal */}
      <VideoUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} />

      {/* Deploy Modal */}
      <DeployModal
        video={deployTarget}
        isOpen={Boolean(deployTarget)}
        onClose={() => setDeployTarget(null)}
      />

      {/* Stream Preview Modal */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-white text-base">{previewVideo.name}</h3>
                <p className="text-xs text-slate-400">{previewVideo.projectionType.toUpperCase()} VR • {formatBytes(previewVideo.sizeBytes)}</p>
              </div>
              <button
                onClick={() => setPreviewVideo(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-black aspect-video flex items-center justify-center">
              <video
                src={`/api/videos/${previewVideo.id}/stream`}
                controls
                autoPlay
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

