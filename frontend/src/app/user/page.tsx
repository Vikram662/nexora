'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { fetchOrganizationData, OrganizationData } from '@/lib/api';

const KYC_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  PENDING_REVIEW: 'In review',
  REJECTED: 'Rejected',
  NOT_STARTED: 'Not started',
};

const NEXT_STEPS = [
  { href: '/user/sandbox', title: 'Test a call in the sandbox', detail: 'Mint a token and join a video, voice or broadcast room from your browser.' },
  { href: '/user/storage', title: 'Connect your recording bucket', detail: 'Recordings go straight to your own S3, Cloudflare R2 or Google Cloud bucket.' },
  { href: '/user/kyc', title: 'Verify your business', detail: 'Submit PAN or GSTIN to raise production limits and get GST tax invoices.' },
];

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
    <div className="space-y-10">
      {failed && (
        <p role="alert" className="text-sm text-red-700">
          Could not load your account details. Refresh the page to try again.
        </p>
      )}

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-6">
        <div className="border-t-2 border-ink pt-3">
          <dt className="text-xs text-muted">Wallet balance</dt>
          <dd className="mt-1 font-mono tabular text-3xl font-semibold text-ink">
            {orgData ? `₹${Number(orgData.walletBalance).toFixed(2)}` : '—'}
          </dd>
          <Link href="/user/billing" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Add money <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        <div className="border-t-2 border-ink pt-3">
          <dt className="text-xs text-muted">Projects</dt>
          <dd className="mt-1 font-mono tabular text-3xl font-semibold text-ink">{orgData ? orgData.projects.length : '—'}</dd>
          <Link href="/user/projects" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Manage projects <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>

        <div className="border-t-2 border-ink pt-3">
          <dt className="text-xs text-muted">Business verification</dt>
          <dd className="mt-1 text-3xl font-display font-semibold text-ink">
            {orgData ? (KYC_LABEL[kycStatus] ?? kycStatus) : '—'}
          </dd>
          <Link href="/user/kyc" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Open KYC <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </dl>

      <section aria-labelledby="projects-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="projects-heading" className="font-display text-lg font-semibold">Projects</h2>
            <p className="text-xs text-muted mt-0.5">Each project has its own API key, so keep one per app.</p>
          </div>
          <Link href="/user/projects" className="text-xs font-semibold text-accent hover:underline">
            All projects
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Environment</th>
                <th scope="col">API key</th>
              </tr>
            </thead>
            <tbody>
              {orgData?.projects.map((proj) => (
                <tr key={proj.id}>
                  <td className="font-semibold text-ink">{proj.name}</td>
                  <td>{proj.environment === 'PRODUCTION' ? 'Production' : 'Sandbox'}</td>
                  <td className="font-mono text-xs text-muted">{proj.apiKeyPrefix}</td>
                </tr>
              ))}
              {orgData && orgData.projects.length === 0 && (
                <tr>
                  <td colSpan={3} className="text-muted">
                    No projects yet. <Link href="/user/projects" className="text-accent font-semibold hover:underline">Create your first project</Link> to get an API key.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="next-heading">
        <h2 id="next-heading" className="font-display text-lg font-semibold">Set up</h2>
        <ul className="mt-3 border-t border-ink divide-y divide-line">
          {NEXT_STEPS.map((step) => (
            <li key={step.href}>
              <Link href={step.href} className="group flex items-center justify-between gap-6 py-4 hover:bg-ink/[0.03] px-1 -mx-1">
                <span>
                  <span className="block text-sm font-semibold text-ink">{step.title}</span>
                  <span className="block text-xs text-muted mt-0.5 max-w-xl">{step.detail}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted group-hover:text-accent transition-colors" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
