import React, { useEffect, useState } from 'react';
import type { PlaybackSessionDto, Paginated } from '@vrcc/shared-types';
import { apiRequest } from '../api/client.js';
import { History, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function statusTone(status: string | null | undefined): string {
  if (status === 'completed') return 'badge-success';
  if (status === 'stopped') return 'badge-neutral';
  return 'badge-warning';
}

export const SessionsView: React.FC = () => {
  const [sessions, setSessions] = useState<PlaybackSessionDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<Paginated<PlaybackSessionDto>>('/api/sessions', {
        params: { page: 1, pageSize: 50 },
      });
      setSessions(res.items);
    } catch (err) {
      console.warn('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSessions();
  }, []);

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Analytics</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
            Playback <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">history</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            A log of viewing sessions, durations watched, and completion statuses across every paired
            headset.
          </p>
        </div>

        <button onClick={fetchSessions} disabled={loading} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px]" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {sessions.length > 0 ? (
        <div className="overflow-hidden rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_thead_th]:border-b [&_thead_th]:border-white/50 [&_thead_th]:bg-white/35 [&_thead_th]:px-[18px] [&_thead_th]:py-3 [&_thead_th]:text-[9.5px] [&_thead_th]:font-bold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.14em] [&_thead_th]:text-[#475569] [&_tbody_td]:border-b [&_tbody_td]:border-white/40 [&_tbody_td]:px-[18px] [&_tbody_td]:py-[14px] [&_tbody_td]:align-middle [&_tbody_td]:text-[#334155] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#004CE4]/20 [&_tbody_tr:last-child_td]:border-b-0">
              <thead>
                <tr>
                  <th>Headset</th>
                  <th>Video title</th>
                  <th>Started at</th>
                  <th>Watched duration</th>
                  <th>Final status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="font-semibold !text-[#111111]">{s.deviceName}</td>
                    <td>{s.videoName || 'Direct stream / flat'}</td>
                    <td className="font-mono text-[11px]">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="font-mono text-[11px] text-[#555555]">
                      {formatSeconds(s.lastPositionSeconds)} / {formatSeconds(s.durationSeconds)}
                    </td>
                    <td>
                      <span className={`inline-flex h-[22px] items-center gap-[5px] whitespace-nowrap rounded-full border border-transparent px-[9px] text-[10.5px] font-semibold tracking-[0.005em] ${statusTone(s.finalStatus)} capitalize`}>
                        {s.finalStatus === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                        {s.finalStatus === 'stopped' && <CheckCircle2 className="h-3 w-3" />}
                        {s.finalStatus === 'interrupted' && <AlertCircle className="h-3 w-3" />}
                        <span>{s.finalStatus || 'Active'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-[26px] border-[1.5px] border-dashed border-transparent bg-white/50 px-[26px] py-[54px] text-center shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
            <History className="h-6 w-6" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">No playback sessions yet</h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">
            Playback sessions are recorded automatically whenever an experience starts on any paired
            headset.
          </p>
        </div>
      )}
    </div>
  );
};
