'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Activity, BadgeCheck, Server, TrendingUp, CreditCard, Building2 } from 'lucide-react';
import { fetchAdminOverview } from '@/lib/api';
import type { AdminOverview, LedgerTransaction } from '@/lib/types';

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

  return (
    <div className="space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#141838] via-[#161c47] to-[#121636] border border-white/10 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>SFU Node 100% Operational</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold font-display text-white tracking-tight">
            Cluster Telemetry & Infrastructure Ops
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Live monitoring of registered tenants, active WebRTC project instances, KYC pipelines, and wallet ledger balances.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-accent hover:bg-accent-deep text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-accent/20 cursor-pointer flex items-center gap-2 active:scale-95"
          >
            <Activity className="h-3.5 w-3.5" /> Refresh Telemetry
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-semibold shadow-xs">
          Error loading telemetry: {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="panel-card-dark p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Organizations</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 group-hover:scale-110 transition-transform">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold font-mono text-white">
            {loading ? '...' : data?.totalOrgs || 0}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-slate-400">
            Registered developer tenants
          </div>
        </div>

        <div className="panel-card-dark p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Live Projects</span>
            <div className="p-2 rounded-lg bg-accent/15 text-accent-light border border-accent/25 group-hover:scale-110 transition-transform">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold font-mono text-white">
            {loading ? '...' : data?.totalProjects || 0}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-slate-400">
            Provisioned WebRTC apps
          </div>
        </div>

        <div className="panel-card-dark p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pending KYC</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:scale-110 transition-transform">
              <BadgeCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold font-mono text-amber-400 flex items-center gap-2">
            <span>{loading ? '...' : data?.pendingKycCount || 0}</span>
            {(data?.pendingKycCount ?? 0) > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-sans font-semibold">
                Needs review
              </span>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-slate-400">
            Business verification queue
          </div>
        </div>

        <div className="panel-card-dark p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Balance</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 group-hover:scale-110 transition-transform">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold font-mono text-emerald-400">
            {loading ? '...' : `₹${Number(data?.totalSystemWalletBalance || 0).toLocaleString('en-IN')}`}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 text-[11px] text-slate-400">
            Customer prepaid balances
          </div>
        </div>
      </div>

      {/* Cluster Nodes & Recent Transactions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Node Infrastructure Health */}
        <div className="lg:col-span-6 panel-card-dark p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-accent" />
              <span>Media SFU Node Cluster Status</span>
            </h2>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-slate-300">
              Local Region (IN-BOM-1)
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between hover:border-white/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400" />
                <div>
                  <div className="font-bold text-white">LiveKit SFU Engine (Windows Standalone)</div>
                  <div className="text-[11px] text-slate-400 font-mono">127.0.0.1:7880 • TCP:7881 • UDP:50000-60000</div>
                </div>
              </div>
              <span className="font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px]">
                HEALTHY
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between hover:border-white/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-accent" />
                <div>
                  <div className="font-bold text-white">Coturn STUN / TURN Server (Prod Config)</div>
                  <div className="text-[11px] text-slate-400 font-mono">Port 3478 (UDP/TCP) • TLS 5349</div>
                </div>
              </div>
              <span className="font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full text-[10px]">
                READY
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between hover:border-white/20 transition-all">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <div>
                  <div className="font-bold text-white">MySQL Database (Prisma ORM)</div>
                  <div className="text-[11px] text-slate-400 font-mono">3306 • nexora_rtc (XAMPP Native)</div>
                </div>
              </div>
              <span className="font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px]">
                CONNECTED
              </span>
            </div>
          </div>
        </div>

        {/* Recent Ledger Inflow / Topups */}
        <div className="lg:col-span-6 panel-card-dark p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-400" />
              <span>Recent Wallet Transactions</span>
            </h2>
            <Link href="/admin/billing" className="text-xs text-accent-light hover:text-white font-semibold flex items-center gap-1 transition-colors">
              View Ledger →
            </Link>
          </div>

          <div className="space-y-2 text-xs">
            {data?.recentTransactions && data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((tx: LedgerTransaction) => (
                <div key={tx.id} className="p-3 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between hover:border-white/20 transition-all">
                  <div>
                    <div className="font-bold text-white">{tx.organization?.name || 'Customer Org'}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {tx.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-400 font-mono">+₹{Number(tx.amount).toFixed(2)}</span>
                    <div className="text-[10px] text-slate-400 font-mono uppercase">{tx.status}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-slate-400">
                No recent transactions recorded.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

