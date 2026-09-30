'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, XCircle } from 'lucide-react';
import { fetchAdminKycList, reviewAdminKyc, errorMessage } from '@/lib/api';
import type { KycSubmission } from '@/lib/types';
import { useToast } from '@/components/ToastProvider';

export default function AdminKycReviewPage() {
  const { success, error: toastError, prompt } = useToast();
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const loadData = () => {
    fetchAdminKycList()
      .then((data) => {
        setSubmissions(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleReview = async (id: string, action: 'APPROVE' | 'REJECT') => {
    let reason: string | undefined = undefined;
    if (action === 'REJECT') {
      const input = await prompt({
        title: 'Reject KYC submission',
        message: 'Please provide a reason for rejecting this KYC submission.',
        confirmLabel: 'Reject',
        danger: true,
        input: { placeholder: 'Reason' },
      });
      if (!input) return; // cancelled
      reason = input;
    }

    setReviewingId(id);
    try {
      await reviewAdminKyc(id, action, reason);
      success(`KYC status updated: ${action === 'APPROVE' ? 'Verified' : 'Rejected'}`);
      loadData();
    } catch (err) {
      toastError(errorMessage(err,'Failed to review KYC'));
    } finally {
      setReviewingId(null);
    }
  };

  const filtered = submissions.filter((sub) => {
    if (filterStatus === 'ALL') return true;
    return sub.status === filterStatus;
  });

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight flex items-center gap-2.5">
            <BadgeCheck className="h-6 w-6 text-accent" />
            <span>KYC Compliance & Verification Queue</span>
          </h1>
          <p className="text-xs text-muted mt-1">
            Review customer PAN, GSTIN, Company CIN, or DigiLocker submissions to unlock production live streaming.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {['ALL', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                filterStatus === st
                  ? 'bg-console text-white'
                  : 'bg-white border border-line text-muted hover:bg-paper'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error: {error}
        </div>
      )}

      {/* Submissions Table */}
      <div className="bg-white rounded-lg border border-line overflow-hidden">
        <div className="overflow-x-auto">
          <table className="ledger w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-paper border-b border-line text-muted font-bold text-[10px]">
                <th className="py-3.5 px-5">Organization</th>
                <th className="py-3.5 px-5">Document Type</th>
                <th className="py-3.5 px-5">Decrypted Identifier</th>
                <th className="py-3.5 px-5">Verification Method</th>
                <th className="py-3.5 px-5">Status</th>
                <th className="py-3.5 px-5">Submitted Date</th>
                <th className="py-3.5 px-5 text-right">Review Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading compliance queue...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No KYC submissions match the selected filter.
                  </td>
                </tr>
              ) : (
                filtered.map((sub) => (
                  <tr key={sub.id} className="hover:bg-paper/80 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-bold text-ink">{sub.organizationName}</div>
                      <div className="text-[11px] text-slate-400">{sub.organizationEmail}</div>
                    </td>

                    <td className="py-4 px-5">
                      <span className="font-semibold text-ink px-2 py-0.5 rounded bg-paper-deep border border-line text-[11px]">
                        {sub.documentType}
                      </span>
                    </td>

                    <td className="py-4 px-5 font-mono font-bold text-ink">
                      {sub.documentNumber}
                    </td>

                    <td className="py-4 px-5">
                      {sub.verifiedViaDigiLocker ? (
                        <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 font-bold px-2 py-0.5 rounded-sm text-[10px]">
                          DigiLocker Direct
                        </span>
                      ) : (
                        <span className="text-muted bg-paper-deep font-medium px-2 py-0.5 rounded text-[10px]">
                          Manual Upload
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-5">
                      <span
                        className={`px-2.5 py-0.5 rounded-sm text-[11px] font-bold ${
                          sub.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : sub.status === 'PENDING_REVIEW'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {sub.status.replace('_', ' ')}
                      </span>
                      {sub.rejectionReason && (
                        <div className="text-[10px] text-red-600 mt-1 max-w-xs">
                          Reason: {sub.rejectionReason}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-5 text-muted text-[11px]">
                      {sub.submittedAt ? new Date(sub.submittedAt).toLocaleDateString() : 'N/A'}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {sub.status === 'PENDING_REVIEW' || sub.status === 'REJECTED' ? (
                          <button
                            disabled={reviewingId === sub.id}
                            onClick={() => handleReview(sub.id, 'APPROVE')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </button>
                        ) : null}

                        {sub.status === 'PENDING_REVIEW' || sub.status === 'VERIFIED' ? (
                          <button
                            disabled={reviewingId === sub.id}
                            onClick={() => handleReview(sub.id, 'REJECT')}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1"
                          >
                            <XCircle className="h-3.5 w-3.5" /> Reject
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
