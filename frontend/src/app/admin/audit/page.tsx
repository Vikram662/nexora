'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { ShieldCheck, Lock, Key, Database, RefreshCw } from 'lucide-react';
import { fetchAdminAuditLog } from '@/lib/api';
import { STAFF_ROLE_LABELS, type StaffRole } from '@/lib/staff-access';
import type { AdminAuditEntry } from '@/lib/types';

const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const formatAction = (action: string) => action.replaceAll('_', ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    fetchAdminAuditLog()
      .then((rows) => {
        setEntries(rows);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-accent" />
          <span>Security & Staff Audit</span>
        </h1>
        <p className="text-xs text-muted mt-1">
          How stored secrets are protected, and every action staff have taken in this console.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="border-t-2 border-ink pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Stored secrets</span>
            <Lock className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-ink">AES-256-GCM</div>
          <div className="text-[11px] text-muted">Own IV and auth tag per record (bucket keys, Firebase, KYC numbers)</div>
        </div>

        <div className="border-t-2 border-ink pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Master key version</span>
            <Key className="h-4 w-4 text-accent" />
          </div>
          <div className="text-base font-bold text-ink">v1</div>
          <div className="text-[11px] text-muted">From ENCRYPTION_MASTER_KEY in the backend environment</div>
        </div>

        <div className="border-t-2 border-ink pt-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Room tokens</span>
            <Database className="h-4 w-4 text-accent" />
          </div>
          <div className="text-base font-bold text-ink">HMAC-SHA256 JWT</div>
          <div className="text-[11px] text-muted">Signed with the LiveKit API secret (32+ characters)</div>
        </div>
      </div>

      <section className="panel-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-sm font-bold text-ink">Staff actions</h2>
          <button
            onClick={() => {
              setLoading(true);
              load();
            }}
            className="text-xs font-semibold text-accent hover:underline cursor-pointer inline-flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
        )}

        <div className="overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Staff member</th>
                <th scope="col">Action</th>
                <th scope="col">Target</th>
                <th scope="col">Note</th>
                <th scope="col">IP</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="text-muted text-xs whitespace-nowrap">{formatWhen(e.createdAt)}</td>
                  <td>
                    <div className="font-semibold text-ink text-xs">{e.staffUser?.email ?? 'Unknown'}</div>
                    {e.staffUser?.role && (
                      <div className="text-[10px] text-muted">{STAFF_ROLE_LABELS[e.staffUser.role as StaffRole] ?? e.staffUser.role}</div>
                    )}
                  </td>
                  <td className="text-xs font-semibold text-ink">{formatAction(e.action)}</td>
                  <td className="text-[11px] text-muted">
                    {e.targetType}
                    <div className="font-mono break-all">{e.targetId}</div>
                  </td>
                  <td className="text-[11px] text-muted">{e.reason || '-'}</td>
                  <td className="text-[11px] text-muted font-mono">{e.ipAddress || '-'}</td>
                </tr>
              ))}
              {!loading && entries.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted text-xs">No staff actions recorded yet.</td>
                </tr>
              )}
              {loading && entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted text-xs">Loading…</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
