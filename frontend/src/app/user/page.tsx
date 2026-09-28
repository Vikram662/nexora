'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Video,
  HardDrive,
  BadgeCheck,
  CheckCircle2,
  Clock,
  Key,
  ShieldCheck,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { fetchOrganizationData, OrganizationData } from '@/lib/api';

export default function UserOverviewPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => setOrgData(data))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">LiveKit Media SFU</div>
          <div className="text-2xl font-black text-slate-900 flex items-baseline gap-2">
            Online <span className="text-xs font-bold text-emerald-600">:7880</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Coturn NAT Relay enabled</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Wallet Balance</div>
          <div className="text-2xl font-black text-slate-900">
            ₹{Number(orgData?.walletBalance || 500).toFixed(2)}
          </div>
          <Link href="/user/billing" className="text-[11px] text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1">
            Top up wallet <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Total Projects</div>
          <div className="text-2xl font-black text-slate-900">
            {orgData?.projects.length || 1}
          </div>
          <Link href="/user/projects" className="text-[11px] text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1">
            Manage projects <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">BYOS Storage</div>
          <div className="text-2xl font-black text-emerald-600">
            GCS / S3 / R2
          </div>
          <Link href="/user/storage" className="text-[11px] text-blue-600 hover:underline font-semibold mt-1 inline-flex items-center gap-1">
            Configure buckets <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div>
        <h3 className="text-sm font-bold text-slate-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/user/sandbox"
            className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 text-left transition-all shadow-sm hover:shadow group block"
          >
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <Video className="h-5 w-5" />
            </div>
            <div className="font-bold text-slate-900 text-sm">Launch Video Sandbox</div>
            <p className="text-xs text-slate-500 mt-1">Test real-time video/audio calling straight inside your browser.</p>
          </Link>

          <Link
            href="/user/storage"
            className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 text-left transition-all shadow-sm hover:shadow group block"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <HardDrive className="h-5 w-5" />
            </div>
            <div className="font-bold text-slate-900 text-sm">Google Cloud / S3 Bucket</div>
            <p className="text-xs text-slate-500 mt-1">Stream recordings directly to your GCS, S3, or Cloudflare R2 bucket.</p>
          </Link>

          <Link
            href="/user/kyc"
            className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-blue-400 text-left transition-all shadow-sm hover:shadow group block"
          >
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div className="font-bold text-slate-900 text-sm">Business KYC & Invoicing</div>
            <p className="text-xs text-slate-500 mt-1">Verify PAN/GSTIN to enable full production limits and GST tax invoices.</p>
          </Link>
        </div>
      </div>

      {/* Projects Snapshot */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Active Projects</h3>
            <p className="text-xs text-slate-500">Isolate credentials per mobile app or web platform.</p>
          </div>
          <Link
            href="/user/projects"
            className="px-3.5 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1"
          >
            View All Projects <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {orgData?.projects.map((proj) => (
            <div key={proj.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 text-xs">{proj.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {proj.environment}
                </span>
              </div>
              <div className="font-mono text-xs text-slate-600 bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between">
                <span>{proj.apiKeyPrefix}</span>
                <span className="text-[10px] text-slate-400 font-sans">Active Key</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
