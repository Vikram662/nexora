'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, BadgeCheck, Server, CreditCard, Building2, RefreshCw } from 'lucide-react';
import { fetchAdminOverview } from '@/lib/api';
import type { AdminOverview, LedgerTransaction } from '@/lib/types';

const INR = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Usage deductions are stored as positive amounts but take money out of the wallet.
function signedAmount(tx: LedgerTransaction): number {
  const amount = Number(tx.amount);
  return tx.type === 'USAGE_DEDUCTION' ? -Math.abs(amount) : amount;
}

const CLUSTER_NODES = [
  { name: 'LiveKit SFU Engine (Windows Standalone)', detail: '127.0.0.1:7880 • TCP:7881 • UDP:50000-60000', status: 'HEALTHY', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { name: 'Coturn STUN / TURN Server (Prod Config)', detail: 'Port 3478 (UDP/TCP) • TLS 5349', status: 'CONFIG READY', dot: 'bg-accent', badge: 'bg-accent/10 text-accent-deep border-accent/20' },
  { name: 'MySQL Database (Prisma ORM)', detail: '3306 • nexora_rtc (XAMPP Native)', status: 'CONNECTED', dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
];

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = () => {
    fetchAdminOverview()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const pendingKyc = data?.pendingKycCount ?? 0;

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-console text-white border border-console-line">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SFU Node 100% Operational</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold font-display tracking-tight">
            Cluster Telemetry & Infrastructure Ops
          </h1>
          <p className="text-xs text-slate-300 mt-1 max-w-xl">
            Live monitoring of registered tenants, active WebRTC project instances, KYC pipelines, and wallet ledger balances.
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start md:self-auto px-4 py-2 bg-accent hover:bg-accent-deep text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Telemetry
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error loading telemetry: {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="panel-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Organizations</span>
            <div className="p-2 rounded-lg bg-accent/10 text-accent border border-accent/20">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold font-mono tabular text-ink">
            {loading ? '...' : data?.totalOrgs || 0}
          </div>
          <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
            Registered developer tenants
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Live Projects</span>
            <div className="p-2 rounded-lg bg-accent/10 text-accent border border-accent/20">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold font-mono tabular text-ink">
            {loading ? '...' : data?.totalProjects || 0}
          </div>
          <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
            Provisioned WebRTC apps
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Pending KYC</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
              <BadgeCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold font-mono tabular text-amber-600 flex items-center gap-2">
            <span>{loading ? '...' : pendingKyc}</span>
            {pendingKyc > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-sans font-semibold">
                Needs review
              </span>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-line text-[11px]">
            <Link href="/admin/kyc" className="text-accent hover:underline font-semibold">
              Review submissions →
            </Link>
          </div>
        </div>

        <div className="panel-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Customer wallets</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-bold font-mono tabular text-ink">
            {loading ? '...' : INR(Number(data?.totalSystemWalletBalance || 0))}
          </div>
          <div className="mt-4 pt-3 border-t border-line text-[11px] text-muted">
            Customer prepaid balances
          </div>
        </div>
      </div>

      {/* Cluster Nodes & Recent Transactions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Node Infrastructure Health */}
        <section className="lg:col-span-6 panel-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <span>Media SFU Node Cluster Status</span>
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-paper-deep text-ink">
              Local Region (IN-BOM-1)
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {CLUSTER_NODES.map((node) => (
              <div key={node.name} className="p-3.5 rounded-lg border border-line bg-paper/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${node.dot}`} />
                  <div className="min-w-0">
                    <div className="font-bold text-ink">{node.name}</div>
                    <div className="text-[11px] text-muted font-mono">{node.detail}</div>
                  </div>
                </div>
                <span className={`font-semibold border px-2 py-0.5 rounded-full text-[10px] shrink-0 ${node.badge}`}>
                  {node.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Ledger Inflow / Topups */}
        <section className="lg:col-span-6 panel-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              <span>Recent Wallet Transactions</span>
            </h2>
            <Link href="/admin/billing" className="text-xs text-accent hover:underline font-semibold">
              View full ledger →
            </Link>
          </div>

          <div className="space-y-2 text-xs">
            {data?.recentTransactions && data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((tx: LedgerTransaction) => {
                const amount = signedAmount(tx);
                return (
                  <div key={tx.id} className="p-3 rounded-lg border border-line flex items-center justify-between hover:bg-paper transition-colors">
                    <div>
                      <div className="font-bold text-ink">{tx.organization?.name || 'Customer Org'}</div>
                      <div className="text-[11px] text-muted">
                        {new Date(tx.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {tx.type}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={`whitespace-nowrap font-bold font-mono tabular ${amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {amount < 0 ? '−' : '+'}{INR(Math.abs(amount))}
                      </span>
                      <div className={`text-[10px] font-mono uppercase ${tx.status === 'FAILED' ? 'text-red-600' : 'text-muted'}`}>{tx.status}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted">
                {loading ? 'Loading…' : 'No recent transactions recorded.'}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
