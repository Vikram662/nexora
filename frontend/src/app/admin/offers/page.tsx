'use client';

import { useEffect, useState } from 'react';
import {
  Radio,
  Tag,
  Plus,
  Percent,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Gift,
  Building2,
} from 'lucide-react';
import { fetchAdminOffers, createAdminOffer, toggleAdminOffer } from '@/lib/api';

export default function AdminOffersPage() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [minRechargeAmount, setMinRechargeAmount] = useState('500');
  const [bonusType, setBonusType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>('PERCENTAGE');
  const [bonusValue, setBonusValue] = useState('20');
  const [maxBonusAmount, setMaxBonusAmount] = useState('1000');
  const [perOrgLimit, setPerOrgLimit] = useState('1');
  const [validDays, setValidDays] = useState('30');

  const loadOffers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminOffers();
      setOffers(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch promotional offers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOffers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createAdminOffer({
        title,
        minRechargeAmount: Number(minRechargeAmount) || 0,
        bonusType,
        bonusValue: Number(bonusValue) || 0,
        maxBonusAmount: maxBonusAmount ? Number(maxBonusAmount) : undefined,
        perOrgLimit: Number(perOrgLimit) || 1,
        validDays: Number(validDays) || 30,
      });
      setShowModal(false);
      setTitle('');
      await loadOffers();
    } catch (err: any) {
      alert(err.message || 'Failed to create offer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleAdminOffer(id);
      await loadOffers();
    } catch (err: any) {
      alert(err.message || 'Failed to change offer status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Gift className="h-5 w-5 text-indigo-600" />
            <span>Promotional Offers & Wallet Bonus Coupons</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure dynamic bonus credit incentives, welcome promotions, and percentage top-up discounts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadOffers}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create New Offer
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-xl">
          {error}
        </div>
      )}

      {/* Offers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {offers.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-slate-200 p-8">
            <Tag className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-700">No active promotional campaigns</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Click &quot;Create New Offer&quot; above to launch a wallet top-up promotion for developers.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              Launch First Promotion
            </button>
          </div>
        )}

        {offers.map((offer) => {
          const isExpired = new Date(offer.validUntil) < new Date();
          return (
            <div
              key={offer.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm flex flex-col justify-between transition-all ${
                offer.isActive && !isExpired
                  ? 'border-indigo-200 hover:border-indigo-400'
                  : 'border-slate-200 opacity-60'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      offer.isActive && !isExpired
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {isExpired ? 'EXPIRED' : offer.isActive ? 'ACTIVE CAMPAIGN' : 'PAUSED'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-400">
                    ID: {offer.id.substring(0, 8)}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <Tag className="h-4 w-4 text-indigo-600" />
                  {offer.title}
                </h3>

                <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Incentive:</span>
                    <span className="font-extrabold text-indigo-700">
                      {offer.bonusType === 'PERCENTAGE'
                        ? `+${Number(offer.bonusValue)}% Bonus Credit`
                        : `+₹${Number(offer.bonusValue)} Flat Credit`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Min. Top-up:</span>
                    <span className="font-bold text-slate-800">
                      ₹{Number(offer.minRechargeAmount).toFixed(2)}
                    </span>
                  </div>
                  {offer.maxBonusAmount && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">Max Bonus Cap:</span>
                      <span className="font-bold text-slate-800">
                        ₹{Number(offer.maxBonusAmount).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Redemptions:</span>
                    <span className="font-bold text-slate-800">
                      {offer._count?.redemptions || 0} claimed
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Until {new Date(offer.validUntil).toLocaleDateString()}
                </div>
                <button
                  onClick={() => handleToggle(offer.id)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    offer.isActive
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                >
                  {offer.isActive ? 'Pause Offer' : 'Activate Offer'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Gift className="h-5 w-5 text-indigo-600" />
                Launch Promotional Coupon
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Campaign Title / Promo Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Diwal Topup 25% Extra or Welcome Bonus"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Bonus Type</label>
                  <select
                    value={bonusType}
                    onChange={(e: any) => setBonusType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="PERCENTAGE">Percentage (%) Bonus</option>
                    <option value="FIXED_AMOUNT">Flat Amount (₹) Credit</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {bonusType === 'PERCENTAGE' ? 'Bonus Percent (%)' : 'Flat Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    value={bonusValue}
                    onChange={(e) => setBonusValue(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min. Recharge (₹)</label>
                  <input
                    type="number"
                    value={minRechargeAmount}
                    onChange={(e) => setMinRechargeAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Max Bonus Cap (₹)</label>
                  <input
                    type="number"
                    value={maxBonusAmount}
                    onChange={(e) => setMaxBonusAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Per Tenant Limit</label>
                  <input
                    type="number"
                    value={perOrgLimit}
                    onChange={(e) => setPerOrgLimit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Validity (Days)</label>
                  <input
                    type="number"
                    value={validDays}
                    onChange={(e) => setValidDays(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Publish Offer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
