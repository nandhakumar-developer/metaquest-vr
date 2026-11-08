import React from 'react';
import { useApp } from '../context/AppContext.js';
import { DownloadCloud, CheckCircle2, Clock, AlertTriangle, XCircle, X } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function statusTone(status: string): string {
  if (status === 'ready') return 'badge-success';
  if (status === 'downloading') return 'badge-coral';
  if (status === 'failed') return 'badge-danger';
  return 'badge-neutral';
}

export const DeploymentsView: React.FC = () => {
  const { deployments, cancelDeployment } = useApp();

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Transfers</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
            Deployments <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">&amp; transfers</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            Local headset download progress and checksum verification. Shared library playback remains
            separate from these offline copies.
          </p>
        </div>
        <span className="inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] border-[#E1E1E1] bg-[#F1F1F1] text-[#334155] h-7 px-3">
          {deployments.length} active record{deployments.length === 1 ? '' : 's'}
        </span>
      </div>

      {deployments.length > 0 ? (
        <div className="overflow-hidden rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_thead_th]:border-b [&_thead_th]:border-white/50 [&_thead_th]:bg-white/35 [&_thead_th]:px-[18px] [&_thead_th]:py-3 [&_thead_th]:text-[9.5px] [&_thead_th]:font-bold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.14em] [&_thead_th]:text-[#475569] [&_tbody_td]:border-b [&_tbody_td]:border-white/40 [&_tbody_td]:px-[18px] [&_tbody_td]:py-[14px] [&_tbody_td]:align-middle [&_tbody_td]:text-[#334155] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#004CE4]/20 [&_tbody_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th>Video asset</th>
                  <th>Target headset</th>
                  <th>Status</th>
                  <th className="w-52">Progress</th>
                  <th>Data transferred</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deployments.map((d) => {
                  const percent = Math.round(d.progress * 100);
                  const isActive = d.status === 'downloading' || d.status === 'queued' || d.status === 'pending';

                  return (
                    <tr key={d.id}>
                      <td className="max-w-xs truncate font-semibold !text-[#111111]">{d.videoName}</td>
                      <td>{d.deviceName}</td>
                      <td>
                        <span className={`inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] ${statusTone(d.status)} capitalize`}>
                          {d.status === 'ready' && <CheckCircle2 className="h-3 w-3" />}
                          {d.status === 'downloading' && <DownloadCloud className="h-3 w-3" />}
                          {d.status === 'failed' && <AlertTriangle className="h-3 w-3" />}
                          {d.status === 'cancelled' && <XCircle className="h-3 w-3" />}
                          {(d.status === 'pending' || d.status === 'queued') && <Clock className="h-3 w-3" />}
                          <span>{d.status}</span>
                        </span>
                      </td>
                      <td>
                        <div className="space-y-1.5">
                          <div className="flex justify-between font-mono text-[10px] text-[#8A8A8A]">
                            <span>{percent}%</span>
                          </div>
                          <div className="h-[5px] overflow-hidden rounded-full bg-[#F1F1F1]">
                            <div
                              className={`h-full rounded-full bg-gradient-to-r from-[#4E7EFF] to-[#004CE4] transition-[width] duration-300 ${d.status === 'ready' ? 'from-[#20D9A5] to-[#20D9A5]' : ''}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="font-mono text-[11px]">
                        {formatBytes(d.bytesReceived)} / {formatBytes(d.totalBytes)}
                      </td>
                      <td className="text-right">
                        {isActive && (
                          <button
                            onClick={() => void cancelDeployment(d.id)}
                            title="Cancel deployment"
                            className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/35 text-[#334155] backdrop-blur-[14px] hover:bg-white/65 hover:text-[#0F172A] h-[30px] w-[30px] rounded-[9px] p-0 text-[#8A8A8A] hover:text-[#B91C1C]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-[26px] border-[1.5px] border-dashed border-transparent bg-white/50 px-[26px] py-[54px] text-center shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
            <DownloadCloud className="h-6 w-6" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">No deployments queued</h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">
            When you deploy videos from the library to headsets, live download progress and checksum
            verification appear here.
          </p>
        </div>
      )}
    </div>
  );
};
