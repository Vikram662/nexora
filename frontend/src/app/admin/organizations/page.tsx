'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import {
  Building2,
  CreditCard,
  PlusCircle,
  FolderKanban,
  Users2,
  ArrowUpDown,
  Search,
  CheckCircle2,
} from 'lucide-react';
import { fetchAdminOrganizations, adjustOrgBalance } from '@/lib/api';

export default function AdminOrganizationsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Balance adjustment modal state
  const [selectedOrg, setSelectedOrg] = useState<any | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(1000);
  const [adjustReason, setAdjustReason] = useState<string>('Discretionary test credits / promo');
  const [adjustLoading, setAdjustLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    fetchAdminOrganizations()
      .then((data) => {
        setOrgs(data);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg) return;
    setAdjustLoading(true);
    setSuccessMsg(null);
    try {
      await adjustOrgBalance(selectedOrg.id, Number(adjustAmount), adjustReason);
      setSuccessMsg(`Successfully credited ₹${adjustAmount} to ${selectedOrg.name}!`);
      setSelectedOrg(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to adjust balance');
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="h-6 w-6 text-blue-600" />
            <span>Organizations & Custom Rates</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage enterprise organizations, review live project allocations, and issue wallet balance adjustments.
          </p>
        </div>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>{successMsg}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
          Error: {error}
        </div>
      )}

      {/* Orgs Grid */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                <th className="py-3.5 px-5">Organization</th>
                <th className="py-3.5 px-5">Plan Tier</th>
                <th className="py-3.5 px-5">Wallet Balance</th>
                <th className="py-3.5 px-5">Projects</th>
                <th className="py-3.5 px-5">KYC Status</th>
                <th className="py-3.5 px-5">Created Date</th>
                <th className="py-3.5 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading organizations...
                  </td>
                </tr>
              ) : orgs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                orgs.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-bold text-slate-900">{org.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{org.billingEmail}</div>
                    </td>

                    <td className="py-4 px-5">
                      <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full text-[10px]">
                        {org.planTier}
                      </span>
                    </td>

                    <td className="py-4 px-5 font-bold text-emerald-600 text-sm">
                      ₹{Number(org.walletBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>

                    <td className="py-4 px-5 text-slate-600 font-semibold">
                      {org.projects?.length || org._count?.projects || 0} Apps
                    </td>

                    <td className="py-4 px-5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          org.kycVerification?.status === 'VERIFIED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {org.kycVerification?.status || 'NOT_STARTED'}
                      </span>
                    </td>

                    <td className="py-4 px-5 text-slate-500 text-[11px]">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>

                    <td className="py-4 px-5 text-right">
                      <button
                        onClick={() => setSelectedOrg(org)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <CreditCard className="h-3 w-3" /> Adjust Balance
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Adjust Balance Modal */}
      {selectedOrg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Adjust Wallet Balance for {selectedOrg.name}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Current Escrow Balance: <strong className="text-emerald-600">₹{Number(selectedOrg.walletBalance).toFixed(2)}</strong>
              </p>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Credit / Debit Amount (INR ₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  placeholder="e.g. 500 or -200"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Positive numbers add balance; negative numbers deduct.
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Adjustment Reason / Notes</label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedOrg(null)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {adjustLoading ? 'Processing...' : 'Confirm Balance Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
