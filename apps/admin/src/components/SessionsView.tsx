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
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Playback Session History
          </h2>
          <p className="text-xs text-slate-400">
            Log of user viewing sessions, durations watched, and completion statuses across all headsets
          </p>
        </div>

        <button
          onClick={fetchSessions}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {sessions.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Headset</th>
                  <th className="py-3 px-4">Video Title</th>
                  <th className="py-3 px-4">Started At</th>
                  <th className="py-3 px-4">Watched Duration</th>
                  <th className="py-3 px-4">Final Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {s.deviceName}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {s.videoName || 'Direct Stream / Flat'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {new Date(s.startedAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-cyan-400">
                      {formatSeconds(s.lastPositionSeconds)} / {formatSeconds(s.durationSeconds)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${
                        s.finalStatus === 'completed'
                          ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                          : s.finalStatus === 'stopped'
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-amber-950/60 text-amber-400 border-amber-800'
                      }`}>
                        {s.finalStatus === 'completed' && <CheckCircle2 className="w-3 h-3" />}
                        {s.finalStatus === 'stopped' && <CheckCircle2 className="w-3 h-3 text-slate-400" />}
                        {s.finalStatus === 'interrupted' && <AlertCircle className="w-3 h-3" />}
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
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <History className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Playback Sessions Yet</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Playback sessions are automatically recorded whenever an experience starts on any paired headset.
          </p>
        </div>
      )}
    </div>
  );
};

