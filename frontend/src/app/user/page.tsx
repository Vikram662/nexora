'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Wallet, KeyRound, ShieldCheck, Plus, ExternalLink, Zap } from 'lucide-react';
import { fetchOrganizationData, OrganizationData } from '@/lib/api';

const KYC_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  PENDING_REVIEW: 'In review',
  REJECTED: 'Rejected',
  NOT_STARTED: 'Not started',
};

export default function UserOverviewPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => setOrgData(data))
      .catch(() => setFailed(true));
  }, []);

  const kycStatus = orgData?.kycVerification?.status ?? 'NOT_STARTED';

  return (
    <div className="space-y-8">
      {failed && (
        <div role="alert" className="p-4 rounded-xl bg-red-50/80 border border-red-200 text-sm text-red-700 flex items-center justify-between shadow-2xs">
          <span>Could not load your account details. Refresh the page to try again.</span>
          <button onClick={() => window.location.reload()} className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-800 text-xs font-semibold rounded-md transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Hero Quick Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-accent via-indigo-600 to-violet-700 p-6 md:p-8 text-white shadow-lg shadow-accent/15">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-[11px] font-semibold text-white/90">
              <Zap className="h-3 w-3 text-amber-300" />
              <span>Real-Time WebRTC PaaS</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight font-display">
              Welcome to your Nexora Console
            </h2>
            <p className="text-xs md:text-sm text-white/80 leading-relaxed">
              Mint real-time tokens, connect your own S3/R2 storage bucket for video recordings, and manage prepaid GST billing seamlessly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/user/sandbox"
              className="px-4 py-2.5 rounded-xl bg-white text-ink hover:bg-slate-50 font-semibold text-xs transition-all shadow-md hover:scale-105 active:scale-95 flex items-center gap-1.5"
            >
              Launch Sandbox <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/user/projects"
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs backdrop-blur-md transition-all flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> New Project
            </Link>
          </div>
        </div>
        <div className="absolute -right-12 -bottom-16 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Wallet Balance</span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 group-hover:scale-110 transition-transform">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono tabular text-3xl font-extrabold text-ink tracking-tight">
            {orgData ? `₹${Number(orgData.walletBalance).toFixed(2)}` : '—'}
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0f2f6] flex items-center justify-between">
            <span className="text-[11px] text-muted font-medium">Prepaid Ledger</span>
            <Link href="/user/billing" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep transition-colors">
              Add Money <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Active Projects</span>
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 group-hover:scale-110 transition-transform">
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 font-mono tabular text-3xl font-extrabold text-ink tracking-tight">
            {orgData ? orgData.projects.length : '—'}
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0f2f6] flex items-center justify-between">
            <span className="text-[11px] text-muted font-medium">API Keys & Endpoints</span>
            <Link href="/user/projects" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep transition-colors">
              Manage Keys <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        <div className="panel-card p-5 relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Business KYC</span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100 group-hover:scale-110 transition-transform">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold font-display text-ink flex items-center gap-2">
            <span>{orgData ? (KYC_LABEL[kycStatus] ?? kycStatus) : '—'}</span>
            {kycStatus === 'VERIFIED' && (
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-[#f0f2f6] flex items-center justify-between">
            <span className="text-[11px] text-muted font-medium">Compliance status</span>
            <Link href="/user/kyc" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-deep transition-colors">
              Verification <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Projects Section */}
      <section aria-labelledby="projects-heading" className="panel-card p-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#e2e7f0]">
          <div>
            <h2 id="projects-heading" className="font-display text-base font-bold text-ink">Active WebRTC Projects</h2>
            <p className="text-xs text-muted mt-0.5">Isolated credentials and rate limiting per project</p>
          </div>
          <Link href="/user/projects" className="text-xs font-semibold text-accent hover:underline flex items-center gap-1">
            All Projects <ExternalLink className="h-3 w-3" />
          </Link>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Environment</th>
                <th scope="col">API Key Prefix</th>
                <th scope="col" className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {orgData?.projects.map((proj) => (
                <tr key={proj.id}>
                  <td className="font-semibold text-ink flex items-center gap-2 py-3">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    <span>{proj.name}</span>
                  </td>
                  <td>
                    <span className={`badge-pill ${proj.environment === 'PRODUCTION' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}`}>
                      {proj.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'}
                    </span>
                  </td>
                  <td className="font-mono text-xs text-muted">{proj.apiKeyPrefix}</td>
                  <td className="text-right">
                    <Link href="/user/sandbox" className="text-xs font-semibold text-accent hover:underline">
                      Test in Sandbox
                    </Link>
                  </td>
                </tr>
              ))}
              {orgData && orgData.projects.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted text-xs">
                    No projects found. Create your first project to get API credentials.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Next Steps Quick Guide */}
      <section aria-labelledby="next-heading" className="panel-card p-6">
        <h2 id="next-heading" className="font-display text-base font-bold text-ink">Getting Started Checklist</h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/user/sandbox" className="p-4 rounded-xl border border-[#e2e7f0] bg-slate-50/50 hover:bg-white hover:border-accent/40 hover:shadow-xs transition-all group">
            <span className="block text-xs font-bold text-accent uppercase tracking-wider">Step 1</span>
            <span className="block text-sm font-bold text-ink mt-1 group-hover:text-accent transition-colors">Test in Sandbox</span>
            <span className="block text-xs text-muted mt-1 leading-relaxed">Mint a token and test real-time video, audio, or broadcast right inside your browser.</span>
          </Link>
          <Link href="/user/storage" className="p-4 rounded-xl border border-[#e2e7f0] bg-slate-50/50 hover:bg-white hover:border-accent/40 hover:shadow-xs transition-all group">
            <span className="block text-xs font-bold text-indigo-600 uppercase tracking-wider">Step 2</span>
            <span className="block text-sm font-bold text-ink mt-1 group-hover:text-accent transition-colors">Connect BYOS Storage</span>
            <span className="block text-xs text-muted mt-1 leading-relaxed">Route WebRTC session recordings directly into your customer AWS S3 or Cloudflare R2 bucket.</span>
          </Link>
          <Link href="/user/kyc" className="p-4 rounded-xl border border-[#e2e7f0] bg-slate-50/50 hover:bg-white hover:border-accent/40 hover:shadow-xs transition-all group">
            <span className="block text-xs font-bold text-emerald-600 uppercase tracking-wider">Step 3</span>
            <span className="block text-sm font-bold text-ink mt-1 group-hover:text-accent transition-colors">Verify Business KYC</span>
            <span className="block text-xs text-muted mt-1 leading-relaxed">Unlock high production concurrency limits and automated GST compliance tax invoices.</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

