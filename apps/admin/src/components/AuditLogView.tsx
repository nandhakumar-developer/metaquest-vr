import React, { useEffect, useState } from 'react';
import type { AuditLogDto, Paginated } from '@vrcc/shared-types';
import { apiRequest } from '../api/client.js';
import { FileText, Shield, RefreshCw } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const res = await apiRequest<Paginated<AuditLogDto>>('/api/audit', {
        params: { page: 1, pageSize: 50 },
      });
      setLogs(res.items);
    } catch (err) {
      console.warn('Failed to fetch audit logs', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, []);

  return (
    <div className="page-stack">
      <div className="section-head">
        <div>
          <span className="eyebrow">Security</span>
          <h1 className="page-title">
            Audit <span className="serif-accent text-[#6d3a52]">trail</span>
          </h1>
          <p className="page-desc">
            An immutable record of administrative commands, pairing events, and configuration updates
            across this gateway.
          </p>
        </div>

        <button onClick={fetchLogs} disabled={loading} className="btn btn-secondary btn-sm" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {logs.length > 0 ? (
        <div className="table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Payload details</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-[10.5px]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="font-semibold text-[#6c56a8]">
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-[#a99a90]" />
                        <span>{log.actor}</span>
                      </div>
                    </td>
                    <td className="text-[11px] text-[#92601a]">{log.action}</td>
                    <td className="text-[10px] uppercase tracking-wide">
                      {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)})` : ''}
                    </td>
                    <td className="max-w-xs truncate text-[10.5px]">{JSON.stringify(log.payload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="empty-title">No audit logs</h3>
          <p className="empty-desc">Actions performed by operators will be recorded here.</p>
        </div>
      )}
    </div>
  );
};
