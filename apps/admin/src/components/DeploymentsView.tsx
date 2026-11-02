import React from 'react';
import { useApp } from '../context/AppContext.js';
import { DownloadCloud, CheckCircle2, Clock, AlertTriangle, XCircle, X } from 'lucide-react';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const DeploymentsView: React.FC = () => {
  const { deployments, cancelDeployment } = useApp();

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <DownloadCloud className="w-5 h-5 text-cyan-400" />
            Active Transfers & Deployments ({deployments.length})
          </h2>
          <p className="text-xs text-slate-400">
            Local headset download progress and checksum verification. Shared library playback remains separate.
          </p>
        </div>
      </div>

      {deployments.length > 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Video Asset</th>
                  <th className="py-3 px-4">Target Headset</th>
                  <th className="py-3 px-4">Transfer Status</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Data Transferred</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {deployments.map((d) => {
                  const percent = Math.round(d.progress * 100);
                  const isActive = d.status === 'downloading' || d.status === 'queued' || d.status === 'pending';

                  return (
                    <tr key={d.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-medium text-white max-w-xs truncate">
                        {d.videoName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {d.deviceName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold capitalize border ${
                          d.status === 'ready'
                            ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                            : d.status === 'downloading'
                            ? 'bg-cyan-950/60 text-cyan-400 border-cyan-800 animate-pulse'
                            : d.status === 'failed'
                            ? 'bg-rose-950/60 text-rose-400 border-rose-800'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}>
                          {d.status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
                          {d.status === 'downloading' && <DownloadCloud className="w-3 h-3" />}
                          {d.status === 'failed' && <AlertTriangle className="w-3 h-3" />}
                          {d.status === 'cancelled' && <XCircle className="w-3 h-3" />}
                          {(d.status === 'pending' || d.status === 'queued') && <Clock className="w-3 h-3" />}
                          <span>{d.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 w-48">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] font-mono text-slate-400">
                            <span>{percent}%</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${
                                d.status === 'ready' ? 'bg-emerald-500' : 'bg-cyan-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">
                        {formatBytes(d.bytesReceived)} / {formatBytes(d.totalBytes)}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {isActive && (
                          <button
                            onClick={() => void cancelDeployment(d.id)}
                            title="Cancel Deployment"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                          >
                            <X className="w-4 h-4" />
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
        <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30">
          <DownloadCloud className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">No Deployments Queued</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            When you deploy videos from the library to headsets, live download progress and checksum verification appear here.
          </p>
        </div>
      )}
    </div>
  );
};

