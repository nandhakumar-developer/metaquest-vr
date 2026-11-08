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
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end justify-between gap-[18px] rounded-[26px] border border-transparent bg-white/50 px-6 py-[18px] shadow-[0_12px_36px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
        <div>
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#003BB5] before:mr-0 before:inline-block before:h-[1.5px] before:w-4 before:rounded-full before:bg-[#004CE4] before:content-['']">Security</span>
          <h1 className="mt-2 font-display text-[clamp(24px,2.6vw,30px)] font-extrabold leading-[1.15] tracking-[-0.04em] text-[#0F172A]">
            Audit <span className="font-display font-semibold not-italic tracking-[-0.01em] text-[#004CE4]">trail</span>
          </h1>
          <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-[1.65] text-[#334155]">
            An immutable record of administrative commands, pairing events, and configuration updates
            across this gateway.
          </p>
        </div>

        <button onClick={fetchLogs} disabled={loading} className="inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-[12px] font-semibold leading-none tracking-[-0.008em] transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004CE4] disabled:cursor-not-allowed disabled:opacity-40 disabled:transform-none hover:-translate-y-px bg-white/65 text-[#0F172A] shadow-[0_4px_14px_rgba(0,0,0,0.06)] backdrop-blur-[18px] hover:bg-white/90 h-8 gap-1.5 px-[13px] text-[11.5px]" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {logs.length > 0 ? (
        <div className="overflow-hidden rounded-[26px] border border-transparent bg-white/50 shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px] [&_thead_th]:whitespace-nowrap [&_thead_th]:border-b [&_thead_th]:border-white/50 [&_thead_th]:bg-white/35 [&_thead_th]:px-[18px] [&_thead_th]:py-3 [&_thead_th]:text-[9.5px] [&_thead_th]:font-bold [&_thead_th]:uppercase [&_thead_th]:tracking-[0.14em] [&_thead_th]:text-[#475569] [&_tbody_td]:border-b [&_tbody_td]:border-white/40 [&_tbody_td]:px-[18px] [&_tbody_td]:py-[14px] [&_tbody_td]:align-middle [&_tbody_td]:text-[#334155] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#004CE4]/20 [&_tbody_tr:last-child_td]:border-b-0">
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
                    <td className="font-semibold text-[#004CE4]">
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-[#8A8A8A]" />
                        <span>{log.actor}</span>
                      </div>
                    </td>
                    <td className="text-[11px] text-[#003BB5]">{log.action}</td>
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
        <div className="rounded-[26px] border-[1.5px] border-dashed border-transparent bg-white/50 px-[26px] py-[54px] text-center shadow-[0_14px_40px_rgba(0,0,0,0.07)] backdrop-blur-[32px]">
          <div className="mx-auto mb-4 grid h-[54px] w-[54px] place-items-center rounded-[17px] border border-[#004CE4]/20 bg-[#004CE4]/20 text-[#004CE4]">
            <FileText className="h-6 w-6" />
          </div>
          <h3 className="font-display text-[15px] font-bold tracking-[-0.02em]">No audit logs</h3>
          <p className="mx-auto mt-1.5 max-w-[380px] text-[12px] leading-[1.6] text-[#64748B]">Actions performed by operators will be recorded here.</p>
        </div>
      )}
    </div>
  );
};
