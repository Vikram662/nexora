'use client';

import { useEffect, useState } from 'react';
import { CreditCard, CheckCircle2, Receipt, Building2, Download, Save } from 'lucide-react';
import {
  fetchOrganizationData,
  createPaymentOrder,
  verifyPayment,
  updateCustomerBillingProfile,
  OrganizationData,
  getApiBaseUrl, errorMessage } from '@/lib/api';
import type { PaymentOrder, TaxInvoice, RazorpayResponse } from '@/lib/types';
import { useToast } from '@/components/ToastProvider';

export default function UserBillingPage() {
  const { success, error: toastError, info } = useToast();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [topupLoading, setTopupLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [activePaymentOrder, setActivePaymentOrder] = useState<PaymentOrder | null>(null);
  const [paymentSuccessAlert, setPaymentSuccessAlert] = useState(false);
  const [, setLoading] = useState(true);
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
    void Promise.resolve().then(loadData);
  }, []);

  const handleSaveBillingProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateCustomerBillingProfile(profileForm);
      setProfileSavedSuccess(true);
      success('Billing profile updated successfully');
      setTimeout(() => setProfileSavedSuccess(false), 3000);
      loadData();
    } catch (err) {
      toastError(errorMessage(err,'Failed to save billing profile'));
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
      if (typeof window !== 'undefined' && window.Razorpay) {
        const options = {
          key: order.keyId,
          amount: order.amount * 100, // paise
          currency: 'INR',
          name: 'Nexora RTC PaaS',
          description: `Prepaid Wallet Recharge ₹${order.amount}`,
          order_id: order.orderId,
          handler: async function (response: RazorpayResponse) {
            try {
              await verifyPayment({
                razorpayOrderId: response.razorpay_order_id || order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              setPaymentSuccessAlert(true);
              success(`Wallet recharged with ₹${order.amount}!`);
              setTimeout(() => setPaymentSuccessAlert(false), 4000);
              loadData();
            } catch (err) {
              toastError(errorMessage(err,'Payment Verification Failed: Invalid Gateway Signature'));
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

        const rzp = new window.Razorpay!(options);
        rzp.on('payment.failed', function (resp) {
          toastError(`Payment failed: ${resp.error.description}`);
        });
        rzp.open();
      } else {
        // Fallback to Order Review Modal if Razorpay script is blocked
        setActivePaymentOrder(order);
        setShowPaymentModal(true);
      }
    } catch (err) {
      toastError(errorMessage(err,'Payment initiation failed'));
    } finally {
      setTopupLoading(false);
    }
  };

  const handleConfirmPayment = async () => {
    if (!activePaymentOrder) return;
    info('Real verification enforced: Please enter valid Razorpay credentials in Admin Settings or pay via live Razorpay checkout to generate a verified cryptographic signature.');
    setShowPaymentModal(false);
  };

  return (
    <div className="space-y-6">
      <div className="border-t-2 border-ink pt-5 space-y-6">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" />
            Wallet
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Top-ups are added to your balance in full. GST is added to each session&rsquo;s per-minute charge, and tax invoices are issued for each billing period.
          </p>
        </div>

        {paymentSuccessAlert && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Wallet top-up successful! ₹{topupAmount} credited directly to your balance.
          </div>
        )}

        {/* Current balance */}
        <dl className="grid sm:grid-cols-3 gap-x-8 gap-y-4 border-y border-ink py-4">
          <div>
            <dt className="text-xs text-muted">Available balance</dt>
            <dd className="mt-1 font-mono tabular text-3xl font-semibold text-ink">
              {orgData ? `₹${Number(orgData.walletBalance).toFixed(2)}` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Plan</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">{orgData?.planTier || 'STARTER'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Invoices go to</dt>
            <dd className="mt-1 text-sm font-semibold text-ink break-all">{orgData?.billingEmail ?? '—'}</dd>
          </div>
        </dl>

        {/* Top-up Presets */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-ink">Add money</span>
            <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Credited in full, no GST on top-ups
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[500, 1000, 2500, 5000].map((amt) => (
              <button
                key={amt}
                onClick={() => handleInitiateTopup(amt)}
                className="p-4 rounded-md border border-line hover:border-accent hover:bg-accent/10 text-ink font-bold text-center transition-all cursor-pointer group"
              >
                <div className="text-sm font-semibold text-ink group-hover:text-accent">₹{amt}</div>
                <div className="text-[10px] text-slate-400 font-medium mt-0.5">₹{amt} Balance Added</div>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Recharge Form */}
        <div className="p-4 rounded-md bg-paper border border-line max-w-md space-y-3 text-xs">
          <label className="block font-semibold text-ink">Custom Topup Amount (₹)</label>
          <div className="flex gap-2">
            <input
              type="number"
              min={100}
              step={100}
              value={topupAmount}
              onChange={(e) => setTopupAmount(Number(e.target.value))}
              className="flex-1 px-3 py-2 bg-white border border-line rounded-md font-bold text-ink text-sm"
            />
            <button
              onClick={() => handleInitiateTopup()}
              disabled={topupLoading}
              className="px-5 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md transition-all cursor-pointer disabled:opacity-50"
            >
              {topupLoading ? 'Opening...' : 'Recharge via Razorpay'}
            </button>
          </div>
        </div>

        {/* Recent Transactions Table */}
        <div className="space-y-3 pt-2">
          <span className="font-bold text-xs text-ink">Recent Wallet Transactions</span>
          <div className="border border-line rounded-md overflow-hidden text-xs">
            <div className="p-3 bg-paper border-b border-line font-semibold text-muted flex justify-between text-[10px]">
              <span>Transaction Ref</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Status</span>
            </div>

            <div className="divide-y divide-line font-mono">
              <div className="p-3 flex justify-between items-center hover:bg-paper/50">
                <span className="text-muted">pay_seed_init_1001</span>
                <span className="px-2 py-0.5 rounded bg-accent/10 text-accent-deep font-sans text-[10px] font-bold">WALLET_TOPUP</span>
                <span className="text-emerald-600 font-bold">+₹500.00</span>
                <span className="text-emerald-700 font-bold text-[10px] font-sans">SUCCESS</span>
              </div>
              {orgData?.transactions?.map((tx) => (
                <div key={tx.id} className="p-3 flex justify-between items-center hover:bg-paper/50">
                  <span className="text-muted">{tx.gatewayPaymentId || tx.id.substring(0, 16)}</span>
                  <span className="px-2 py-0.5 rounded bg-accent/10 text-accent-deep font-sans text-[10px] font-bold">{tx.type}</span>
                  <span className="text-emerald-600 font-bold">+₹{Number(tx.amount).toFixed(2)}</span>
                  <span className="text-emerald-700 font-bold text-[10px] font-sans">{tx.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GST Billing Invoices Table */}
        <div className="space-y-3 pt-4 border-t border-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
              <Receipt className="h-4 w-4 text-accent" />
              <span>Tax Invoices & SAC 998314 Receipts</span>
            </div>
            <span className="text-[10px] text-slate-400">Monthly billing receipts with GST input tax credit (ITC)</span>
          </div>

          <div className="border border-line rounded-md overflow-hidden text-xs">
            <div className="p-3 bg-paper border-b border-line font-semibold text-muted flex justify-between text-[10px]">
              <span>Invoice #</span>
              <span>Billing Cycle</span>
              <span>Amount</span>
              <span className="text-right">Action</span>
            </div>

            <div className="divide-y divide-line font-medium">
              {orgData?.invoices && orgData.invoices.length > 0 ? (
                orgData.invoices.map((inv: TaxInvoice) => (
                  <div key={inv.id} className="p-3 flex justify-between items-center hover:bg-paper/50">
                    <span className="font-mono font-bold text-accent-deep">{inv.invoiceNumber}</span>
                    <span className="text-muted text-[11px]">
                      {new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}
                    </span>
                    <span className="font-bold text-ink">₹{Number(inv.totalAmount).toFixed(2)}</span>
                    <button
                      onClick={() => window.open(`${getApiBaseUrl()}/v1/portal/invoices/${inv.id}/print`, '_blank')}
                      className="px-2.5 py-1 bg-accent/10 hover:bg-accent/15 text-accent-deep rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border border-accent/30"
                    >
                      <Download className="h-3 w-3" /> View or print
                    </button>
                  </div>
                ))
              ) : (
                <p className="p-3 text-muted text-xs">
                  No tax invoices yet. Invoices are issued after each billing month closes, for the sessions charged in that month.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* GST Billing Details Form */}
        <div className="pt-4 border-t border-line space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 font-bold text-xs text-ink">
                <Building2 className="h-4 w-4 text-accent" />
                <span>GST Legal Entity & Invoice Details</span>
              </div>
              <p className="text-[11px] text-muted mt-0.5">
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
              <label className="block font-semibold text-ink mb-1">Legal Company / Business Name</label>
              <input
                type="text"
                value={profileForm.legalBusinessName}
                onChange={(e) => setProfileForm({ ...profileForm, legalBusinessName: e.target.value })}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                placeholder="Acme Tech Private Limited"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Company GSTIN (15 Digits)</label>
              <input
                type="text"
                maxLength={15}
                value={profileForm.gstin}
                onChange={(e) => setProfileForm({ ...profileForm, gstin: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono"
                placeholder="27ABCDE1234F1Z5"
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">PAN Number</label>
              <input
                type="text"
                maxLength={10}
                value={profileForm.panNumber}
                onChange={(e) => setProfileForm({ ...profileForm, panNumber: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono"
                placeholder="ABCDE1234F"
                required
              />
            </div>

            <div suppressHydrationWarning>
              <label className="block font-semibold text-ink mb-1">Invoice Dispatch Email</label>
              <input
                type="email"
                value={profileForm.invoiceEmail}
                onChange={(e) => setProfileForm({ ...profileForm, invoiceEmail: e.target.value })}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                placeholder="finance@company.com"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-ink mb-1">Registered Billing Address</label>
              <input
                type="text"
                value={profileForm.billingAddressLine1}
                onChange={(e) => setProfileForm({ ...profileForm, billingAddressLine1: e.target.value })}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                placeholder="Tower B, Tech Cyber Park, 4th Floor"
                required
              />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:col-span-2">
              <div>
                <label className="block font-semibold text-ink mb-1">City</label>
                <input
                  type="text"
                  value={profileForm.city}
                  onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                  placeholder="Mumbai"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">Place of Supply (State)</label>
                <input
                  type="text"
                  value={profileForm.placeOfSupplyStateCode}
                  onChange={(e) => setProfileForm({ ...profileForm, placeOfSupplyStateCode: e.target.value })}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                  placeholder="27 - Maharashtra"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-ink mb-1">Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  value={profileForm.pincode}
                  onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono"
                  placeholder="400051"
                  required
                />
              </div>
            </div>

            <div className="sm:col-span-2 flex justify-end pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-2 bg-console hover:bg-console-line text-white rounded-md font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 bg-console/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-5 border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-xs">
                  R
                </div>
                <span className="font-bold text-sm text-ink">Razorpay Checkout</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400">{activePaymentOrder.orderId}</span>
            </div>

            <div className="text-center py-2 space-y-1">
              <div className="text-xs text-muted font-semibold">Total Recharge Amount</div>
              <div className="text-3xl font-semibold text-ink">₹{activePaymentOrder.amount}.00</div>
              <div className="text-[11px] text-slate-400">Nexora RTC PaaS Prepaid Topup</div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-md bg-accent/10 border border-accent/20 text-ink font-medium space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Payment Gateway</span>
                  <span className="text-emerald-600">Simulated Test Mode</span>
                </div>
                <div className="text-[11px] text-accent-deep">
                  Select payment instrument below to complete wallet recharge:
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                <button
                  onClick={handleConfirmPayment}
                  className="p-3 rounded-md border border-line hover:border-accent hover:bg-accent/10 text-ink text-center transition-all cursor-pointer"
                >
                  UPI (GPay / PhonePe)
                </button>
                <button
                  onClick={handleConfirmPayment}
                  className="p-3 rounded-md border border-line hover:border-accent hover:bg-accent/10 text-ink text-center transition-all cursor-pointer"
                >
                  Credit / Debit Card
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="w-full py-2 bg-paper-deep hover:bg-line text-ink rounded-md font-semibold text-xs cursor-pointer"
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
