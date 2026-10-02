'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import { CreditCard, CheckCircle2, Receipt, Building2, Download, Save } from 'lucide-react';
import {
  fetchOrganizationData,
  createPaymentOrder,
  verifyPayment,
  updateCustomerBillingProfile,
  OrganizationData,
  getApiBaseUrl, errorMessage } from '@/lib/api';
import type { TaxInvoice, RazorpayResponse, CreditNote } from '@/lib/types';
import { useToast } from '@/components/ToastProvider';
import { formatSignedInr, signedAmount } from '@/lib/ledger';
import { AutoRecharge } from '@/components/AutoRecharge';

export default function UserBillingPage() {
  const { success, error: toastError } = useToast();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [topupAmount, setTopupAmount] = useState(1000);
  const [topupLoading, setTopupLoading] = useState(false);
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
            name: orgData?.name || '',
            email: orgData?.billingEmail || '',
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
        toastError('The payment window could not load. Turn off your ad blocker or check your connection, then try again.');
      }
    } catch (err) {
      toastError(errorMessage(err,'Payment initiation failed'));
    } finally {
      setTopupLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Razorpay Checkout is only needed on this page (top-ups and saving a card for auto recharge). */}
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
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

        <AutoRecharge onWalletChange={loadData} />

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
          {orgData?.transactions && orgData.transactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Transaction ref</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col" className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orgData.transactions.map((tx) => {
                    const amount = signedAmount(tx);
                    return (
                      <tr key={tx.id}>
                        <td className="font-mono text-xs text-muted">{tx.gatewayPaymentId || tx.id.substring(0, 16)}</td>
                        <td>
                          <span className="px-2 py-0.5 rounded bg-accent/10 text-accent-deep text-[10px] font-bold">{tx.type}</span>
                        </td>
                        <td className={`text-right font-mono font-bold ${amount < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {formatSignedInr(amount)}
                        </td>
                        <td className={`text-right text-[10px] font-bold ${tx.status === 'SUCCESS' ? 'text-emerald-700' : tx.status === 'FAILED' ? 'text-red-600' : 'text-muted'}`}>
                          {tx.status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-xs">No wallet transactions yet.</p>
          )}
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

          {orgData?.invoices && orgData.invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Invoice #</th>
                    <th scope="col">Billing cycle</th>
                    <th scope="col" className="text-right">Amount</th>
                    <th scope="col" className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orgData.invoices.map((inv: TaxInvoice) => (
                    <tr key={inv.id}>
                      <td className="font-mono font-bold text-accent-deep">{inv.invoiceNumber}</td>
                      <td className="text-muted text-[11px]">
                        {new Date(inv.periodStart).toLocaleDateString('en-IN')} - {new Date(inv.periodEnd).toLocaleDateString('en-IN')}
                      </td>
                      <td className="text-right font-bold text-ink">₹{Number(inv.totalAmount).toFixed(2)}</td>
                      <td className="text-right">
                        <span className="inline-flex items-center gap-2">
                          <button
                            onClick={() => window.open(`${getApiBaseUrl()}/v1/portal/invoices/${inv.id}/print`, '_blank')}
                            className="px-2.5 py-1 bg-accent/10 hover:bg-accent/15 text-accent-deep rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border border-accent/30"
                          >
                            <Download className="h-3 w-3" /> View or print
                          </button>
                          <a
                            href={`${getApiBaseUrl()}/v1/portal/invoices/${inv.id}/pdf`}
                            className="px-2.5 py-1 border border-line hover:border-ink text-ink rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
                          >
                            PDF
                          </a>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted text-xs">
              No tax invoices yet. Invoices are issued after each billing month closes, for the sessions charged in that month.
            </p>
          )}

          {orgData?.creditNotes && orgData.creditNotes.length > 0 && (
            <div className="pt-4 space-y-2">
              <div className="font-bold text-xs text-ink">Credit notes</div>
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Credit note</th>
                    <th scope="col">Against invoice</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Amount</th>
                    <th scope="col"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {orgData.creditNotes.map((note: CreditNote) => (
                    <tr key={note.id}>
                      <td className="font-mono font-semibold text-accent-deep">{note.creditNoteNumber}</td>
                      <td className="font-mono text-xs">{note.invoice?.invoiceNumber ?? '-'}</td>
                      <td className="text-muted">{note.reason}</td>
                      <td className="font-semibold">₹{Number(note.totalAmount).toFixed(2)}</td>
                      <td>
                        <button
                          onClick={() => window.open(`${getApiBaseUrl()}/v1/portal/credit-notes/${note.id}/print`, '_blank')}
                          className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                        >
                          View or print
                        </button>
                        <a href={`${getApiBaseUrl()}/v1/portal/credit-notes/${note.id}/pdf`} className="ml-3 text-xs font-semibold text-accent hover:underline">
                          PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
    </div>
  );
}
