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
  Sparkles,
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
  const { videos, deleteVideo, refreshVideos } = useApp();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deployTarget, setDeployTarget] = useState<VideoDto | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoDto | null>(null);

  const handleDelete = async (videoId: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete video "${name}" from the gateway library?`)) {
      await deleteVideo(videoId);
    }
  };

  return (
    <div className="page-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Content library</span>
          <h1 className="page-title">
          Video media <span className="serif-accent text-[#5B94D7]">library</span>
          </h1>
          <p className="page-desc">
            {videos.length > 0
              ? `${videos.length} asset${videos.length === 1 ? '' : 's'} stored on this gateway and ready to stream or deploy to connected headsets.`
              : 'Stored on this gateway and available to every connected Quest headset.'}
          </p>
        </div>

        <button onClick={() => setUploadOpen(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Upload video
        </button>
      </div>

      <div className="alert alert-info">
        <Info className="h-4 w-4" />
        <span>
          Use <strong className="font-semibold">Send to headsets</strong> for a verified offline copy on
          each device — browser player downloads appear under Downloads on the headset. Use{' '}
          <strong className="font-semibold">Group play</strong> for synchronized playback across several
          headsets.
        </span>
      </div>

      {videos.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <article key={video.id} className="panel panel-hover flex flex-col overflow-hidden">
              <div className="relative aspect-video overflow-hidden border-b border-[#dce6f1] bg-[linear-gradient(140deg,#f1f6fc,#fffafd_45%,#dceafa)]">
                {video.thumbnailPath ? (
                  <img
                    src={`/api/videos/${video.id}/thumbnail`}
                    alt={video.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film className="h-10 w-10 text-[#b9a89b]" strokeWidth={1.4} />
                  </div>
                )}

                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                  <span className="badge badge-dark badge-mono">
                    {video.projectionType.toUpperCase()} VR
                  </span>
                  {video.stereoLayout !== 'mono' && (
                    <span className="badge badge-coral badge-mono">
                      3D {video.stereoLayout.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 right-3 rounded-full border border-white/20 bg-[#1d3550]/75 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
                  {formatSeconds(video.durationSeconds)}
                </div>

                <button
                  onClick={() => setPreviewVideo(video)}
                  title="Stream preview"
                  className="group absolute inset-0 flex items-center justify-center bg-[#1d3550]/25 opacity-0 backdrop-blur-[2px] transition duration-200 hover:opacity-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#203248] shadow-lg transition group-hover:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h3 className="truncate text-[13.5px] font-semibold text-[#203248]" title={video.name}>
                    {video.name}
                  </h3>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-[#8091a5]">
                    {video.originalFilename}
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#7189a4]/[0.07] pt-3 text-[10.5px] text-[#8091a5]">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-[#90a0b2]" />
                    <span>{formatBytes(video.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#90a0b2]" />
                    <span>{formatSeconds(video.durationSeconds)}</span>
                  </div>
                  {video.width && video.height && (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#90a0b2]" />
                      <span className="truncate">
                        {video.width}×{video.height}{' '}
                        {video.frameRate ? `@ ${video.frameRate} fps` : ''} ({video.videoCodec || 'H.264'})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#7189a4]/[0.075] bg-white/25 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onOpenGroup(video.id)}
                    title="Open synchronized group playback with this video preselected"
                    className="btn btn-secondary btn-xs"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Group play
                  </button>
                  <button
                    onClick={() => setDeployTarget(video)}
                    title="Download an offline copy to selected Quest headsets"
                    className="btn btn-primary btn-xs"
                  >
                    <DownloadCloud className="h-3.5 w-3.5" />
                    Send to headsets
                  </button>
                </div>

                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setPreviewVideo(video)}
                    title="Play preview"
                    className="btn btn-ghost btn-icon-sm text-[#8091a5]"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => void handleDelete(video.id, video.name)}
                    title="Delete video"
                    className="btn btn-ghost btn-icon-sm text-[#8091a5] hover:text-[#a23f36]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <Film className="h-6 w-6" />
          </div>
          <h3 className="empty-title">No videos uploaded yet</h3>
          <p className="empty-desc">
            Upload your 360°, 180° or flat VR video files to the gateway, then deploy them to your
            Meta Quest 2 headsets.
          </p>
          <button onClick={() => setUploadOpen(true)} className="btn btn-primary btn-sm mt-5">
            <Sparkles className="h-4 w-4" />
            Upload first video
          </button>
        </div>
      )}

      <VideoUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={refreshVideos} />

      <DeployModal video={deployTarget} isOpen={Boolean(deployTarget)} onClose={() => setDeployTarget(null)} />

      {previewVideo && (
        <div className="modal-backdrop">
          <div className="modal max-w-4xl">
            <div className="modal-head">
              <div className="min-w-0">
                <h3 className="modal-title truncate">{previewVideo.name}</h3>
                <p className="modal-sub">
                  {previewVideo.projectionType.toUpperCase()} VR · {formatBytes(previewVideo.sizeBytes)}
                </p>
              </div>
              <button onClick={() => setPreviewVideo(null)} className="btn btn-ghost btn-icon-sm">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-video bg-[#141110]">
              <video
                src={`/api/videos/${previewVideo.id}/stream`}
                controls
                autoPlay
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
