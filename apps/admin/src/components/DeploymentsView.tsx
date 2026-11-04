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
    <div className="page-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Transfers</span>
          <h1 className="page-title">
            Deployments <span className="serif-accent text-[#462FF6]">&amp; transfers</span>
          </h1>
          <p className="page-desc">
            Local headset download progress and checksum verification. Shared library playback remains
            separate from these offline copies.
          </p>
        </div>
        <span className="badge badge-neutral h-7 px-3">
          {deployments.length} active record{deployments.length === 1 ? '' : 's'}
        </span>
      </div>

      {deployments.length > 0 ? (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
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
                        <span className={`badge ${statusTone(d.status)} capitalize`}>
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
                          <div className="progress">
                            <div
                              className={`progress-fill ${d.status === 'ready' ? 'is-success' : ''}`}
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
                            className="btn btn-ghost btn-icon-sm text-[#8A8A8A] hover:text-[#B91C1C]"
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
        <div className="empty-state">
          <div className="empty-icon">
            <DownloadCloud className="h-6 w-6" />
          </div>
          <h3 className="empty-title">No deployments queued</h3>
          <p className="empty-desc">
            When you deploy videos from the library to headsets, live download progress and checksum
            verification appear here.
          </p>
        </div>
      )}
    </div>
  );
};
