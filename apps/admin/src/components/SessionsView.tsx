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
    <div className="page-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Analytics</span>
          <h1 className="page-title">
            Playback <span className="serif-accent text-[#6d3a52]">history</span>
          </h1>
          <p className="page-desc">
            A log of viewing sessions, durations watched, and completion statuses across every paired
            headset.
          </p>
        </div>

        <button onClick={fetchSessions} disabled={loading} className="btn btn-secondary btn-sm" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {sessions.length > 0 ? (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
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
                    <td className="font-semibold !text-[#2a2320]">{s.deviceName}</td>
                    <td>{s.videoName || 'Direct stream / flat'}</td>
                    <td className="font-mono text-[11px]">{new Date(s.startedAt).toLocaleString()}</td>
                    <td className="font-mono text-[11px] text-[#c34c37]">
                      {formatSeconds(s.lastPositionSeconds)} / {formatSeconds(s.durationSeconds)}
                    </td>
                    <td>
                      <span className={`badge ${statusTone(s.finalStatus)} capitalize`}>
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
        <div className="empty-state">
          <div className="empty-icon">
            <History className="h-6 w-6" />
          </div>
          <h3 className="empty-title">No playback sessions yet</h3>
          <p className="empty-desc">
            Playback sessions are recorded automatically whenever an experience starts on any paired
            headset.
          </p>
        </div>
      )}
    </div>
  );
};
