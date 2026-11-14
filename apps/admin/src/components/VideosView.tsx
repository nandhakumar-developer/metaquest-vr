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
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Content library</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
          Video media <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">library</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            {videos.length > 0
              ? `${videos.length} asset${videos.length === 1 ? '' : 's'} stored on this gateway and ready to stream or deploy to connected headsets.`
              : 'Stored on this gateway and available to every connected Quest headset.'}
          </p>
        </div>

        <button onClick={() => setUploadOpen(true)} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)]">
          <Plus className="h-4 w-4" />
          Upload video
        </button>
      </div>

      {videos.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {videos.map((video) => (
            <article key={video.id} className="relative rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden">
              <div className="relative aspect-video overflow-hidden border-b border-[#E1E1E1] bg-[linear-gradient(140deg,#F5F5F5,#F5F5F5_45%,#EAF0FF)]">
                {video.thumbnailPath ? (
                  <img
                    src={`/api/videos/${video.id}/thumbnail`}
                    alt={video.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film className="h-10 w-10 text-[#8A8A8A]" strokeWidth={1.4} />
                  </div>
                )}

                <div className="absolute left-3 top-3 flex items-center gap-1.5">
                  <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-white/10 bg-[#2A2A2A] text-white font-mono text-[9.5px] uppercase tracking-[0.02em]">
                    {video.projectionType.toUpperCase()} VR
                  </span>
                  {video.stereoLayout !== 'mono' && (
                    <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4] font-mono text-[9.5px] uppercase tracking-[0.02em]">
                      3D {video.stereoLayout.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="absolute bottom-3 right-3 rounded-full border border-white/20 bg-[#2A2A2A]/75 px-2.5 py-1 font-mono text-[10px] text-white backdrop-blur">
                  {formatSeconds(video.durationSeconds)}
                </div>

                <button
                  onClick={() => setPreviewVideo(video)}
                  title="Stream preview"
                  className="group absolute inset-0 flex items-center justify-center bg-[#2A2A2A]/25 opacity-0 backdrop-blur-[2px] transition duration-200 hover:opacity-100"
                >
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 text-[#111111] shadow-lg transition group-hover:scale-105">
                    <Play className="ml-0.5 h-5 w-5 fill-current" />
                  </span>
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-3 p-4">
                <div>
                  <h3 className="truncate text-[13.5px] font-semibold text-[#111111]" title={video.name}>
                    {video.name}
                  </h3>
                  <div className="mt-0.5 truncate font-mono text-[10.5px] text-[#8A8A8A]">
                    {video.originalFilename}
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[#E1E1E1] pt-3 text-[10.5px] text-[#8A8A8A]">
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3.5 w-3.5 text-[#8A8A8A]" />
                    <span>{formatBytes(video.sizeBytes)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#8A8A8A]" />
                    <span>{formatSeconds(video.durationSeconds)}</span>
                  </div>
                  {video.width && video.height && (
                    <div className="col-span-2 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#8A8A8A]" />
                      <span className="truncate">
                        {video.width}×{video.height}{' '}
                        {video.frameRate ? `@ ${video.frameRate} fps` : ''} ({video.videoCodec || 'H.264'})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-nowrap items-center justify-between gap-1.5 border-t border-[#E1E1E1] bg-[#F5F5F5] px-3 py-3">
                <button
                  onClick={() => onOpenGroup(video.id)}
                  title="Open synchronized group playback with this video preselected"
                  className="inline-flex h-[27px] items-center justify-center gap-[4px] whitespace-nowrap rounded-full border border-transparent bg-white/65 px-2 text-[9.5px] font-semibold leading-none tracking-[-0.008em] text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] transition-all duration-200 hover:-translate-y-px hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none"
                >
                  <Users className="h-3 w-3" />
                  Group play
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setPreviewVideo(video)}
                    title="Play preview"
                    aria-label={`Play preview of ${video.name}`}
                    className="inline-flex h-[27px] w-[27px] items-center justify-center rounded-[9px] border border-transparent bg-white/35 p-0 text-[#8A8A8A] backdrop-blur-[14px] transition-all duration-200 hover:-translate-y-px hover:bg-white/65 hover:text-[#0F172A] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none"
                  >
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setDeployTarget(video)}
                    title="Download an offline copy to selected Quest headsets"
                    className="inline-flex h-[27px] items-center justify-center gap-[4px] whitespace-nowrap rounded-full border border-transparent bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] px-2 text-[9.5px] font-semibold leading-none tracking-[-0.008em] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] transition-all duration-200 hover:-translate-y-px hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none"
                  >
                    <DownloadCloud className="h-3 w-3" />
                    Send to headsets
                  </button>
                  <button
                    onClick={() => void handleDelete(video.id, video.name)}
                    title="Delete video from the gateway library"
                    aria-label={`Delete ${video.name}`}
                    className="inline-flex h-[27px] items-center justify-center gap-[4px] whitespace-nowrap rounded-full border border-[#FF2525]/20 bg-[#FF2525]/10 px-2 text-[9.5px] font-semibold leading-none tracking-[-0.008em] text-[#B91C1C] backdrop-blur-[14px] transition-all duration-200 hover:-translate-y-px hover:bg-[#FF2525]/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[26px] border-[1.5px] border-dashed border-transparent bg-white/50 px-[26px] py-[54px] text-center shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
            <Film className="h-6 w-6" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">No videos uploaded yet</h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">
            Upload your 360°, 180° or flat VR video files to the gateway, then deploy them to your
            Meta Quest 2 headsets.
          </p>
          <button onClick={() => setUploadOpen(true)} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-gradient-to-br from-[#4E7EFF] to-[#004CE4] text-white shadow-[0_8px_22px_rgba(0,76,228,0.32)] hover:from-[#1F64F0] hover:to-[#004CE4] hover:shadow-[0_10px_28px_rgba(0,76,228,0.4)] h-8 gap-1.5 px-[13px] text-[11.5px] mt-5">
            <Sparkles className="h-4 w-4" />
            Upload first video
          </button>
        </div>
      )}

      <VideoUploadModal isOpen={uploadOpen} onClose={() => setUploadOpen(false)} onUploaded={refreshVideos} />

      <DeployModal video={deployTarget} isOpen={Boolean(deployTarget)} onClose={() => setDeployTarget(null)} />

      {previewVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F172A]/25 p-5 backdrop-blur-2xl">
          <div className="flex max-h-[calc(100svh-40px)] w-full flex-col overflow-hidden rounded-[28px] border border-transparent bg-white/75 shadow-[0_32px_84px_rgba(0,0,0,0.16)] backdrop-blur-[40px] max-w-4xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/60 px-[22px] py-5">
              <div className="min-w-0">
                <h3 className="font-display text-[15.5px] font-bold tracking-[-0.025em] truncate">{previewVideo.name}</h3>
                <p className="mt-[3px] text-[11.5px] text-[#64748B]">
                  {previewVideo.projectionType.toUpperCase()} VR · {formatBytes(previewVideo.sizeBytes)}
                </p>
              </div>
              <button onClick={() => setPreviewVideo(null)} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="aspect-video bg-[#2A2A2A]">
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
