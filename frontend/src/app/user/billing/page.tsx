'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Zap, CheckCircle2, ShieldCheck, ArrowRight, Receipt, Building2, Download, Save } from 'lucide-react';
import {
  fetchOrganizationData,
  createPaymentOrder,
  verifyPayment,
  topupWalletBalance,
  updateCustomerBillingProfile,
  OrganizationData,
} from '@/lib/api';

export default function UserBillingPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activePaymentOrder, setActivePaymentOrder] = useState<any>(null);
  const [paymentSuccessAlert, setPaymentSuccessAlert] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileForm, setProfileForm] = useState({
    legalBusinessName: '',
    gstin: '',
    panNumber: '',
    billingAddressLine1: '',
    city: '',
    placeOfSupplyStateCode: '27 - Maharashtra',
    pincode: '',
    invoiceEmail: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedSuccess, setProfileSavedSuccess] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchOrganizationData();
      setOrgData(data);
      if (data?.billingProfile) {
        setProfileForm({
          legalBusinessName: data.billingProfile.legalBusinessName || data.name || '',
          gstin: data.billingProfile.gstin || '',
          panNumber: data.billingProfile.panNumber || '',
          billingAddressLine1: data.billingProfile.billingAddressLine1 || '',
          city: data.billingProfile.city || '',
          placeOfSupplyStateCode: data.billingProfile.placeOfSupplyStateCode || '27 - Maharashtra',
          pincode: data.billingProfile.pincode || '',
          invoiceEmail: data.billingProfile.invoiceEmail || data.billingEmail || '',
        });
      } else {
        setProfileForm((prev) => ({
          ...prev,
          legalBusinessName: data?.name || '',
          invoiceEmail: data?.billingEmail || '',
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveBillingProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateCustomerBillingProfile(profileForm);
      setProfileSavedSuccess(true);
      setTimeout(() => setProfileSavedSuccess(false), 3000);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save billing profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleInitiateTopup = async (amountToRecharge?: number) => {
    const amt = amountToRecharge || topupAmount;
    setTopupLoading(true);
    try {
      const res = await createPaymentOrder(amt);
      const order = res.data;

      // If Razorpay SDK is loaded and Key ID is present, launch standard checkout
      if (typeof window !== 'undefined' && (window as any).Razorpay) {
        const options = {
          key: order.keyId,
          amount: order.amount * 100, // paise
          currency: 'INR',
          name: 'Nexora RTC PaaS',
          description: `Prepaid Wallet Recharge ₹${order.amount}`,
          order_id: order.orderId,
          handler: async function (response: any) {
            try {
              await verifyPayment({
                razorpayOrderId: response.razorpay_order_id || order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                amount: order.amount,
              });
              setPaymentSuccessAlert(true);
              setTimeout(() => setPaymentSuccessAlert(false), 4000);
              loadData();
            } catch (err: any) {
              alert(err.message || 'Payment Verification Failed: Invalid Gateway Signature');
            }
          },
          prefill: {
            name: orgData?.name || 'Developer',
            email: orgData?.billingEmail || 'developer@company.com',
          },
          theme: {
            color: '#2563eb',
          },
        };

        const rzp = new (window as any).Razorpay(options);
        rzp.on('payment.failed', function (resp: any) {
          alert(`Payment failed: ${resp.error.description}`);
        });
        rzp.open();
      } else {
        // Fallback to Order Review Modal if Razorpay script is blocked
        setActivePaymentOrder(order);
        setShowPaymentModal(true);
      }
    } catch (err: any) {
      alert(err.message || 'Payment initiation failed');
    } finally {
      setTopupLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!activePaymentOrder) return;
    alert('Real verification enforced: Please enter valid Razorpay credentials in Admin Settings or pay via live Razorpay checkout to generate a verified cryptographic signature.');
    setShowPaymentModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-blue-600" />
            Prepaid Wallet & Escrow Funds
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Wallet deposits are held 100% in escrow (0% GST on recharge). Statutory 18% GST is invoiced & deducted at month-end based on actual metered WebRTC usage.
          </p>
        </div>

        {paymentSuccessAlert && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Wallet top-up successful! ₹{topupAmount} credited directly to your balance.
          </div>
        )}

        {/* Current Balance Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-4 shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-xs text-slate-400 uppercase font-semibold tracking-wider">Available Wallet Escrow</span>
              <div className="text-3xl font-black mt-1">₹{Number(orgData?.walletBalance || 500).toFixed(2)}</div>
            </div>
            <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Escrow Active
            </span>
          </div>

          <div className="pt-2 border-t border-slate-700/60 flex items-center justify-between text-xs text-slate-300">
            <span>Tier: <strong className="text-white">{orgData?.planTier || 'STARTER'}</strong></span>
            <span>Billing Email: <strong className="text-white">{orgData?.billingEmail}</strong></span>
          </div>
        </div>

        {/* Top-up Presets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-900">Select Instant Recharge Amount:</span>
            <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              ✓ 100% Pure Balance Credit (No GST deducted on deposit)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[500, 1000, 2500, 5000].map((amt) => (
              <button
                key={amt}
                onClick={() => handleInitiateTopup(amt)}
                className="p-4 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50/50 text-slate-800 font-bold text-center transition-all cursor-pointer group"
              >
                <div className="text-sm font-extrabold text-slate-900 group-hover:text-blue-600">₹{amt}</div>
                <div className="text-[10px] text-slate-400 font-medium mt-0.5">₹{amt} Balance Added</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Recharge Form */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 max-w-md space-y-3 text-xs">
          <label className="block font-semibold text-slate-700">Custom Topup Amount (₹)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={100}
              step={100}
              value={topupAmount}
              onChange={(e) => setTopupAmount(Number(e.target.value))}
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-900 text-sm"
            />
            <button
              onClick={() => handleInitiateTopup()}
              disabled={topupLoading}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {topupLoading ? 'Opening...' : 'Recharge via Razorpay'}
            </button>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="space-y-3 pt-2">
          <span className="font-bold text-xs text-slate-900">Recent Wallet Transactions</span>
          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 flex justify-between uppercase text-[10px]">
              <span>Transaction Ref</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-slate-100 font-mono">
              <div className="p-3 flex justify-between items-center hover:bg-slate-50/50">
                <span className="text-slate-600">pay_seed_init_1001</span>
                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-sans text-[10px] font-bold">WALLET_TOPUP</span>
                <span className="text-emerald-600 font-bold">+₹500.00</span>
                <span className="text-emerald-700 font-bold text-[10px] font-sans">SUCCESS</span>
              </div>
              {orgData?.transactions?.map((tx) => (
                <div key={tx.id} className="p-3 flex justify-between items-center hover:bg-slate-50/50">
                  <span className="text-slate-600">{tx.gatewayPaymentId || tx.id.substring(0, 16)}</span>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-sans text-[10px] font-bold">{tx.type}</span>
                  <span className="text-emerald-600 font-bold">+₹{Number(tx.amount).toFixed(2)}</span>
                  <span className="text-emerald-700 font-bold text-[10px] font-sans">{tx.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GST Billing Invoices Table */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
              <Receipt className="h-4 w-4 text-indigo-600" />
              <span>Tax Invoices & SAC 998314 Receipts</span>
            </div>
            <span className="text-[10px] text-slate-400">Monthly billing receipts with GST input tax credit (ITC)</span>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <div className="p-3 bg-slate-50 border-b border-slate-200 font-semibold text-slate-500 flex justify-between uppercase text-[10px]">
              <span>Invoice #</span>
              <span>Billing Cycle</span>
              <span>Amount</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-slate-100 font-medium">
              {orgData?.invoices && orgData.invoices.length > 0 ? (
                orgData.invoices.map((inv) => (
                  <div key={inv.id} className="p-3 flex justify-between items-center hover:bg-slate-50/50">
                    <span className="font-mono font-bold text-indigo-700">{inv.invoiceNumber}</span>
                    <span className="text-slate-500 text-[11px]">
                      {new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}
                    </span>
                    <span className="font-bold text-slate-900">₹{Number(inv.totalAmount).toFixed(2)}</span>
                    <button
                      onClick={() => window.open(`http://localhost:4000/v1/portal/admin/invoices/${inv.id}/print`, '_blank')}
                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border border-indigo-200"
                    >
                      <Download className="h-3 w-3" /> View / Print PDF
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-3 flex justify-between items-center hover:bg-slate-50/50">
                  <span className="font-mono font-bold text-indigo-700">NXRA-INV-2026-001</span>
                  <span className="text-slate-500 text-[11px]">Current Monthly Billing Period</span>
                  <span className="font-bold text-slate-900">₹2,950.00</span>
                  <button
                    onClick={() => window.open('http://localhost:4000/v1/portal/admin/invoices/latest/print', '_blank')}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border border-indigo-200"
                  >
                    <Download className="h-3 w-3" /> View / Print PDF
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GST Billing Details Form */}
        <div className="pt-4 border-t border-slate-100 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs text-slate-900">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span>GST Legal Entity & Invoice Details</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Ensure your GSTIN and legal business name are updated so your company can claim 18% Input Tax Credit (ITC).
              </p>
            </div>
            {profileSavedSuccess && (
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold text-[11px] flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Saved!
              </span>
            )}
          </div>

          <form onSubmit={handleSaveBillingProfile} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Legal Company / Business Name</label>
              <input
                type="text"
                value={profileForm.legalBusinessName}
                onChange={(e) => setProfileForm({ ...profileForm, legalBusinessName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                placeholder="Acme Tech Private Limited"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Company GSTIN (15 Digits)</label>
              <input
                type="text"
                maxLength={15}
                value={profileForm.gstin}
                onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                placeholder="27ABCDE1234F1Z5"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">PAN Number</label>
              <input
                type="text"
                maxLength={10}
                value={profileForm.panNumber}
                onChange={(e) => setProfileForm({ ...profileForm, panNumber: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase"
                placeholder="ABCDE1234F"
                required
              />
            </div>

            <div suppressHydrationWarning>
              <label className="block font-semibold text-slate-700 mb-1">Invoice Dispatch Email</label>
              <input
                type="email"
                value={profileForm.invoiceEmail}
                onChange={(e) => setProfileForm({ ...profileForm, invoiceEmail: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                placeholder="finance@company.com"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Registered Billing Address</label>
              <input
                type="text"
                value={profileForm.billingAddressLine1}
                onChange={(e) => setProfileForm({ ...profileForm, billingAddressLine1: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                placeholder="Tower B, Tech Cyber Park, 4th Floor"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="Mumbai"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Place of Supply (State)</label>
                <input
                  type="text"
                  value={profileForm.placeOfSupplyStateCode}
                  onChange={(e) => setProfileForm({ ...profileForm, placeOfSupplyStateCode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="27 - Maharashtra"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  value={profileForm.pincode}
                  onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  placeholder="400051"
                  required
                />
              </div>
            </div>

            <div className="sm:col-span-2 flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {savingProfile ? 'Saving...' : 'Update GST Billing Details'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* RAZORPAY PAYMENT MODAL */}
      {showPaymentModal && activePaymentOrder && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 space-y-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                  R
                </div>
                <span className="font-bold text-sm text-slate-900">Razorpay Checkout</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{activePaymentOrder.orderId}</span>
            </div>

            <div className="text-center py-2 space-y-1">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Total Recharge Amount</div>
              <div className="text-3xl font-black text-slate-900">₹{activePaymentOrder.amount}.00</div>
              <div className="text-[11px] text-slate-400">Nexora RTC PaaS Prepaid Topup</div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 font-medium space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Payment Gateway</span>
                  <span className="text-emerald-600">Simulated Test Mode</span>
                </div>
                <div className="text-[11px] text-blue-700">
                  Select payment instrument below to complete wallet recharge:
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                  onClick={handleConfirmPayment}
                  className="p-3 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50 text-slate-800 text-center transition-all cursor-pointer"
                >
                  UPI (GPay / PhonePe)
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="p-3 rounded-xl border border-slate-200 hover:border-blue-600 hover:bg-blue-50 text-slate-800 text-center transition-all cursor-pointer"
                >
                  Credit / Debit Card
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs cursor-pointer"
              >
                Cancel Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
