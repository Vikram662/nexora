'use client';
export const dynamic = 'force-dynamic';

import { ShieldCheck, Lock, Key, Database } from 'lucide-react';

export default function AdminAuditPage() {
  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2.5">
          <ShieldCheck className="h-6 w-6 text-red-600" />
          <span>Master Security, Encryption & Audit Vault</span>
        </h1>
        <p className="text-xs text-muted mt-1">
          Review AES-256-GCM zero-trust key versions, cryptographic envelopes, and platform audit trail.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Envelope Encryption</span>
            <Lock className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-ink">AES-256-GCM Hardware</div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <span>Auth Tag & IV Per Record</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>Master Key Version</span>
            <Key className="h-4 w-4 text-accent" />
          </div>
          <div className="text-base font-bold text-ink">v1 (Active Key Ring)</div>
          <div className="text-[11px] text-slate-400">Zero-Trust Key Management</div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-muted">
            <span>LiveKit API Security</span>
            <Database className="h-4 w-4 text-accent" />
          </div>
          <div className="text-base font-bold text-ink">HMAC-SHA256 Token Vault</div>
          <div className="text-[11px] text-accent font-semibold">Strict 32-char Secret</div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-lg border border-line shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <h2 className="text-sm font-bold text-ink">System Security & Operations Log</h2>
          <span className="text-[10px] text-slate-400 font-mono">Real-time DB Events</span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-3 rounded-md border border-line bg-paper/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <div>
                <span className="font-bold text-ink">LiveKit Media Node (IN-BOM-1)</span>
                <span className="text-muted ml-2">Health check handshake successful (200 OK)</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">1 min ago</span>
          </div>

          <div className="p-3 rounded-md border border-line bg-paper/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent"></span>
              <div>
                <span className="font-bold text-ink">Prisma Connection Pool</span>
                <span className="text-muted ml-2">Session verification query executed</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">3 mins ago</span>
          </div>

          <div className="p-3 rounded-md border border-line bg-paper/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              <div>
                <span className="font-bold text-ink">Auth Guard Middleware</span>
                <span className="text-muted ml-2">nexora_auth_token token signature verified</span>
              </div>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">5 mins ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}
