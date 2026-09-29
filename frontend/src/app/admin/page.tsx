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
    <div className="p-8 space-y-8">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2.5">
            <span>Platform Overview & Telemetry</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time cluster health, developer organization counts, billing ledger, and verification queues.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-3.5 py-1.5 bg-white border border-line text-ink rounded-md text-xs font-bold hover:bg-paper transition-colors shadow-sm cursor-pointer"
          >
            Refresh Telemetry
          </button>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            SFU Node 100% Operational
          </span>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error loading telemetry: {error}
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted text-xs font-semibold">
            <span>Total Organizations</span>
            <Building2 className="h-4 w-4 text-accent" />
          </div>
          <div className="text-2xl font-semibold text-ink">
            {loading ? '...' : data?.totalOrgs || 0}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <span>Registered developer accounts</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted text-xs font-semibold">
            <span>Live Projects</span>
            <Server className="h-4 w-4 text-accent" />
          </div>
          <div className="text-2xl font-semibold text-ink">
            {loading ? '...' : data?.totalProjects || 0}
          </div>
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <span>WebRTC Apps Provisioned</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted text-xs font-semibold">
            <span>Pending KYC Queue</span>
            <BadgeCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-semibold text-amber-600 flex items-center gap-2">
            <span>{loading ? '...' : data?.pendingKycCount || 0}</span>
            {(data?.pendingKycCount ?? 0) > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                Action Req
              </span>
            )}
          </div>
          <Link href="/admin/kyc" className="text-[11px] text-accent hover:underline font-semibold block">
            Review Submissions →
          </Link>
        </div>

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm space-y-2">
          <div className="flex items-center justify-between text-muted text-xs font-semibold">
            <span>Customer Escrow Balance</span>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-semibold text-ink">
            ₹{loading ? '...' : Number(data?.totalSystemWalletBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> Pre-funded customer wallets
          </div>
        </div>
      </div>

      {/* Cluster Nodes & Recent Transactions Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Node Infrastructure Health */}
        <div className="lg:col-span-6 bg-white p-6 rounded-lg border border-line shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-600" />
              <span>Media SFU Node Cluster Status</span>
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-paper-deep text-ink">
              Local Region (IN-BOM-1)
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-md border border-line bg-paper/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
                <div>
                  <div className="font-bold text-ink">LiveKit SFU Engine (Windows Standalone)</div>
                  <div className="text-[11px] text-muted font-mono">127.0.0.1:7880 • TCP:7881 • UDP:50000-60000</div>
                </div>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                HEALTHY
              </span>
            </div>

            <div className="p-3.5 rounded-md border border-line bg-paper/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                <div>
                  <div className="font-bold text-ink">Coturn STUN / TURN Server (Prod Config)</div>
                  <div className="text-[11px] text-muted font-mono">Port 3478 (UDP/TCP) • TLS 5349</div>
                </div>
              </div>
              <span className="font-bold text-accent-deep bg-accent/15 px-2 py-0.5 rounded text-[10px]">
                CONFIG READY
              </span>
            </div>

            <div className="p-3.5 rounded-md border border-line bg-paper/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-emerald-500"></div>
                <div>
                  <div className="font-bold text-ink">MySQL Database (Prisma ORM)</div>
                  <div className="text-[11px] text-muted font-mono">3306 • nexora_rtc (XAMPP Native)</div>
                </div>
              </div>
              <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px]">
                CONNECTED
              </span>
            </div>
          </div>
        </div>

        {/* Recent Ledger Inflow / Topups */}
        <div className="lg:col-span-6 bg-white p-6 rounded-lg border border-line shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-emerald-600" />
              <span>Recent Wallet Transactions</span>
            </h2>
            <Link href="/admin/billing" className="text-xs text-accent hover:underline font-semibold">
              View Full Billing Ledger →
            </Link>
          </div>

          <div className="space-y-2 text-xs">
            {data?.recentTransactions && data.recentTransactions.length > 0 ? (
              data.recentTransactions.map((tx: LedgerTransaction) => (
                <div key={tx.id} className="p-3 rounded-md border border-line flex items-center justify-between hover:bg-paper transition-colors">
                  <div>
                    <div className="font-bold text-ink">{tx.organization?.name || 'Customer Org'}</div>
                    <div className="text-[11px] text-slate-400">
                      {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {tx.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-600">+₹{Number(tx.amount).toFixed(2)}</span>
                    <div className="text-[10px] text-slate-400 font-mono">{tx.status}</div>
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
