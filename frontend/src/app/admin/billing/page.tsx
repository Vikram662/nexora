'use client';

import { useEffect, useState } from 'react';
import { CreditCard, TrendingUp, Receipt, DollarSign, Download, Search, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { fetchAdminBillingOverview, fetchGstr1Report, getApiBaseUrl, errorMessage, generateInvoices, issueCreditNote, processQueuedEmails } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';
import { formatSignedInr, signedAmount } from '@/lib/ledger';
import type { AdminBillingOverview, Gstr1Report, LedgerTransaction, TaxInvoice, OrgSummary, CreditNote } from '@/lib/types';

export default function AdminBillingPage() {
  const [data, setData] = useState<AdminBillingOverview | null>(null);
  const [gstr1Data, setGstr1Data] = useState<Gstr1Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'invoices' | 'escrow' | 'gstr1'>('transactions');
  const [searchTerm, setSearchTerm] = useState('');
  const { success, error: toastError, info } = useToast();
  const [invoiceMonth, setInvoiceMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [generating, setGenerating] = useState(false);
  const [creditFor, setCreditFor] = useState<TaxInvoice | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [creditToWallet, setCreditToWallet] = useState(true);
  const [issuing, setIssuing] = useState(false);

  const openCreditNote = (inv: TaxInvoice) => {
    setCreditFor(inv);
    setCreditAmount('');
    setCreditReason('');
    setCreditToWallet(true);
  };

  const handleIssueCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creditFor) return;
    setIssuing(true);
    try {
      const note = await issueCreditNote({
        invoiceId: creditFor.id,
        amount: Number(creditAmount),
        reason: creditReason.trim(),
        creditToWallet,
      });
      success(`Credit note ${note.creditNoteNumber} issued.`);
      setCreditFor(null);
      await loadData();
    } catch (err) {
      toastError(errorMessage(err, 'Could not issue the credit note'));
    } finally {
      setIssuing(false);
    }
  };

  const handleSendEmails = async () => {
    try {
      const r = await processQueuedEmails();
      if (r.skipped === 'not_configured') info('Email is not set up yet. Add SMTP_HOST and EMAIL_FROM to the server settings.');
      else success(`Sent ${r.sent} email(s). ${r.retrying} will be retried, ${r.failed} failed.`);
    } catch (err) {
      toastError(errorMessage(err, 'Could not send queued emails'));
    }
  };

  const handleGenerateInvoices = async () => {
    setGenerating(true);
    try {
      const result = await generateInvoices(invoiceMonth);
      if (result.created > 0) success(`Created ${result.created} tax invoice(s) for ${invoiceMonth}.`);
      else info(`No new invoices for ${invoiceMonth}. Everything billable is already invoiced.`);
      if (result.skipped.length > 0) {
        toastError(`${result.skipped.length} customer(s) skipped: ${result.skipped[0].reason ?? 'see the server log'}`);
      }
      await loadData();
    } catch (err) {
      toastError(errorMessage(err, 'Could not generate invoices'));
    } finally {
      setGenerating(false);
    }
  };

  const loadData = async () => {
    try {
      const [res, g1] = await Promise.all([
        fetchAdminBillingOverview(),
        fetchGstr1Report().catch(() => ({ data: null })),
      ]);
      setData(res.data);
      setError(null);
      if (g1?.data) setGstr1Data(g1.data);
    } catch (err) {
      setError(errorMessage(err,'Failed to load billing ledger'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, []);

  const summary = data?.summary || {
    totalTopups: 0,
    totalUsageDeductions: 0,
    totalInvoiced: 0,
    totalCustWalletEscrow: 0,
    activePayingTenants: 0,
  };

  const filteredTransactions = (data?.transactions || []).filter((tx: LedgerTransaction) =>
    tx.organization?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tx.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredInvoices = (data?.invoices || []).filter((inv: TaxInvoice) =>
    inv.organization?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredOrgs = (data?.organizations || []).filter((org: OrgSummary) =>
    org.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.billingEmail?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-accent" />
            <span>Platform Financials & Revenue Ledger</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Real-time gross revenue, prepaid wallet deposits, billable WebRTC deductions & statutory GST tax invoices.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-line hover:bg-paper text-ink text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Ledger
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold rounded-md">
          {error}
        </div>
      )}

      {/* KPI Financial Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="border-t-2 border-ink pt-3 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">Gross Deposits</span>
            <div className="h-8 w-8 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-ink mt-2">
            ₹{Number(summary.totalTopups).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>Prepaid wallet recharges processed</span>
          </div>
        </div>

        <div className="border-t-2 border-ink pt-3 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">WebRTC Consumption</span>
            <div className="h-8 w-8 rounded-md bg-accent/10 text-accent flex items-center justify-center">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-ink mt-2">
            ₹{Number(summary.totalUsageDeductions).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Metered participant-minute fees earned
          </div>
        </div>

        <div className="border-t-2 border-ink pt-3 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">Customer wallets</span>
            <div className="h-8 w-8 rounded-md bg-accent/10 text-accent flex items-center justify-center">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-ink mt-2">
            ₹{Number(summary.totalCustWalletEscrow).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            Unspent prepaid balances held across tenants
          </div>
        </div>

        <div className="border-t-2 border-ink pt-3 relative">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted">Invoiced GST Billing</span>
            <div className="h-8 w-8 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-semibold text-ink mt-2">
            ₹{Number(summary.totalInvoiced).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-400 font-medium mt-1">
            SAC 998314 Compliant B2B Tax Invoices
          </div>
        </div>
      </div>

      {/* Main Table Tabs and Content */}
      <div className="bg-white rounded-lg border border-line overflow-hidden">
        {/* Sub-Header with Navigation Tabs and Search */}
        <div className="p-4 border-b border-line flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-paper-deep p-1 rounded-md">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'transactions'
                  ? 'bg-white text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Transactions & Top-ups ({filteredTransactions.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'invoices'
                  ? 'bg-white text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Tax Invoices ({filteredInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab('escrow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'escrow'
                  ? 'bg-white text-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Customer wallet balances ({filteredOrgs.length})
            </button>
            <button
              onClick={() => setActiveTab('gstr1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'gstr1'
                  ? 'bg-white text-accent-deep'
                  : 'text-muted hover:text-ink'
              }`}
            >
              GSTR-1 Outward Return
            </button>
          </div>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Search tenant, ID or type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 bg-paper border border-line rounded-md text-xs pl-8 focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </div>
        </div>

        {/* Tab 1: Transactions Table */}
        {activeTab === 'transactions' && (
          <div className="overflow-x-auto">
            <table className="ledger w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-3 px-4">Transaction Ref</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-medium text-ink">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No transaction records found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx: LedgerTransaction) => (
                    <tr key={tx.id} className="hover:bg-paper/50 transition-colors">
                      <td className="py-3 px-4 font-mono text-[11px] text-muted">
                        {tx.gatewayPaymentId || tx.id.substring(0, 14)}
                      </td>
                      <td className="py-3 px-4 font-bold text-ink">
                        {tx.organization?.name || 'Unknown Org'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
                          {tx.type}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-bold font-mono whitespace-nowrap ${signedAmount(tx) < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {formatSignedInr(signedAmount(tx))}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-bold ${
                          tx.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(tx.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Invoices Table */}
        {activeTab === 'invoices' && (
          <div className="overflow-x-auto">
            <div className="flex flex-wrap items-end gap-3 pb-4">
              <label className="text-xs text-muted">
                Billing month
                <input
                  type="month"
                  value={invoiceMonth}
                  onChange={(e) => setInvoiceMonth(e.target.value)}
                  className="mt-1 block px-3 py-2 bg-paper border border-line rounded-md text-xs text-ink"
                />
              </label>
              <button
                type="button"
                onClick={handleGenerateInvoices}
                disabled={generating || !invoiceMonth}
                className="px-4 py-2 bg-accent hover:bg-accent-deep text-white text-xs font-semibold rounded-md disabled:opacity-50 cursor-pointer"
              >
                {generating ? 'Generating...' : 'Generate invoices'}
              </button>
              <button
                type="button"
                onClick={handleSendEmails}
                className="px-4 py-2 border border-line hover:border-ink text-ink text-xs font-semibold rounded-md cursor-pointer"
              >
                Send queued emails
              </button>
              <p className="text-[11px] text-muted max-w-sm">
                Issues one GST tax invoice per customer for that month&rsquo;s charges. Available 24 hours after the month ends. Running it again never duplicates an invoice. Needs the company GSTIN and address saved in Settings, Tax invoice details.
              </p>
            </div>
            <table className="ledger w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Subtotal</th>
                  <th className="py-3 px-4">GST</th>
                  <th className="py-3 px-4">Total Amount</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-medium text-ink">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No GST invoices have been generated yet for this period.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv: TaxInvoice) => (
                    <tr key={inv.id} className="hover:bg-paper/50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-accent-deep">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 font-bold text-ink">
                        {inv.organization?.name || 'Enterprise'}
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(inv.periodStart).toLocaleDateString('en-IN', { dateStyle: 'medium' })} - {new Date(inv.periodEnd).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                      </td>
                      <td className="py-3 px-4">₹{Number(inv.subtotal).toFixed(2)}</td>
                      <td className="py-3 px-4 text-muted">
                        ₹{(Number(inv.cgstAmount || 0) + Number(inv.sgstAmount || 0) + Number(inv.igstAmount || 0)).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-ink">
                        ₹{Number(inv.totalAmount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => window.open(`${getApiBaseUrl()}/v1/portal/admin/invoices/${inv.id}/print`, '_blank')}
                          className="px-2.5 py-1 rounded-lg bg-accent/10 hover:bg-accent/15 text-accent-deep text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors border border-accent/30"
                        >
                          <Download className="h-3 w-3" /> View or print
                        </button>
                        <a
                          href={`${getApiBaseUrl()}/v1/portal/admin/invoices/${inv.id}/pdf`}
                          className="ml-2 px-2.5 py-1 rounded-lg border border-line hover:border-ink text-ink text-[11px] font-bold inline-flex items-center"
                        >
                          PDF
                        </a>
                        <button
                          onClick={() => openCreditNote(inv)}
                          className="ml-2 px-2.5 py-1 rounded-lg border border-line hover:border-ink text-ink text-[11px] font-bold cursor-pointer"
                        >
                          Credit note
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h3 className="font-display text-base font-semibold mt-10">Credit notes</h3>
            <table className="ledger mt-3">
              <thead>
                <tr>
                  <th scope="col">Credit note</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Against invoice</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Total</th>
                  <th scope="col"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {(data?.creditNotes ?? []).map((note: CreditNote) => (
                  <tr key={note.id}>
                    <td className="font-mono font-semibold text-accent-deep">{note.creditNoteNumber}</td>
                    <td className="font-semibold text-ink">{note.organization?.name}</td>
                    <td className="font-mono text-xs">{note.invoice?.invoiceNumber}</td>
                    <td className="text-muted">{note.reason}</td>
                    <td className="font-semibold">₹{Number(note.totalAmount).toFixed(2)}</td>
                    <td>
                      <button
                        onClick={() => window.open(`${getApiBaseUrl()}/v1/portal/admin/credit-notes/${note.id}/print`, '_blank')}
                        className="text-xs font-semibold text-accent hover:underline cursor-pointer"
                      >
                        View or print
                      </button>
                      <a href={`${getApiBaseUrl()}/v1/portal/admin/credit-notes/${note.id}/pdf`} className="ml-3 text-xs font-semibold text-accent hover:underline">
                        PDF
                      </a>
                    </td>
                  </tr>
                ))}
                {(data?.creditNotes ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-muted">No credit notes yet. Use Credit note on an invoice above to issue one.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {creditFor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setCreditFor(null)}>
            <form
              role="dialog"
              aria-modal="true"
              aria-label="Issue credit note"
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleIssueCreditNote}
              className="w-full max-w-sm rounded-xl bg-white p-5 space-y-3 text-xs"
            >
              <h3 className="text-sm font-bold text-ink">Credit note for {creditFor.invoiceNumber}</h3>
              <p className="text-muted">
                Invoice total ₹{Number(creditFor.totalAmount).toFixed(2)}, GST included. The credit note reverses the tax in the same proportion.
              </p>
              <label className="block">
                <span className="block font-semibold text-ink mb-1">Amount to credit (₹, GST included)</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md tabular"
                />
              </label>
              <label className="block">
                <span className="block font-semibold text-ink mb-1">Reason (printed on the credit note)</span>
                <textarea
                  required
                  minLength={5}
                  maxLength={500}
                  rows={2}
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md"
                />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={creditToWallet} onChange={(e) => setCreditToWallet(e.target.checked)} />
                <span>Add the amount back to the customer&rsquo;s wallet</span>
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setCreditFor(null)} className="px-3 py-1.5 rounded-md border border-line text-muted cursor-pointer">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={issuing}
                  className="px-3 py-1.5 rounded-md bg-accent hover:bg-accent-deep text-white font-bold disabled:opacity-50 cursor-pointer"
                >
                  {issuing ? 'Issuing...' : 'Issue credit note'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 3: Customer Escrow Table */}
        {activeTab === 'escrow' && (
          <div className="overflow-x-auto">
            <table className="ledger w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-3 px-4">Organization Name</th>
                  <th className="py-3 px-4">Billing Email</th>
                  <th className="py-3 px-4">Plan Tier</th>
                  <th className="py-3 px-4">Wallet balance</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Direct Top-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line font-medium text-ink">
                {filteredOrgs.map((org: OrgSummary) => (
                  <tr key={org.id} className="hover:bg-paper/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-ink">
                      {org.name}
                    </td>
                    <td className="py-3 px-4 text-muted font-mono text-[11px]">
                      {org.billingEmail || 'N/A'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-sm text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
                        {org.planTier}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-emerald-600 text-sm">
                      ₹{Number(org.walletBalance).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      {Number(org.walletBalance) > 50 ? (
                        <span className="text-emerald-700 font-bold text-[11px]">● Funded</span>
                      ) : (
                        <span className="text-amber-700 font-bold text-[11px]">● Low Balance</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <a
                        href="/admin/organizations"
                        className="text-xs text-accent hover:text-accent-deep font-bold underline"
                      >
                        Adjust Balance →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 4: GSTR-1 Outward Tax Supplies */}
        {activeTab === 'gstr1' && (
          <div className="p-5 space-y-6">
            <div className="p-4 rounded-md bg-paper border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div>
                <div className="font-bold text-ink text-sm">GSTR-1 outward supplies</div>
                <div className="text-[11px] text-muted mt-0.5">
                  {gstr1Data?.filingPeriod ?? 'Current financial year'}
                  {gstr1Data?.sacCode ? `, SAC ${gstr1Data.sacCode}` : ''}. Totals are net of credit notes.
                </div>
              </div>
              <div className="flex items-center gap-6 text-right">
                <div>
                  <div className="text-[10px] text-muted">Taxable value</div>
                  <div className="text-sm font-semibold text-ink tabular">₹{Number(gstr1Data?.summary?.totalTaxable || 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted">GST output liability</div>
                  <div className="text-sm font-semibold text-accent-deep tabular">₹{Number(gstr1Data?.summary?.totalTaxCollected || 0).toFixed(2)}</div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <h3 className="font-display text-base font-semibold mb-2">Invoices to registered buyers</h3>
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Invoice</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">GSTIN</th>
                    <th scope="col">Place of supply</th>
                    <th scope="col">Taxable</th>
                    <th scope="col">CGST</th>
                    <th scope="col">SGST</th>
                    <th scope="col">IGST</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(gstr1Data?.b2b ?? []).map((inv: TaxInvoice) => (
                    <tr key={inv.id}>
                      <td className="font-mono font-semibold text-accent-deep">{inv.invoiceNumber}</td>
                      <td className="font-semibold text-ink">{inv.customerName}</td>
                      <td className="font-mono text-[11px]">{inv.customerGstin}</td>
                      <td>{inv.placeOfSupply}</td>
                      <td>₹{Number(inv.taxableValue).toFixed(2)}</td>
                      <td>₹{Number(inv.cgst).toFixed(2)}</td>
                      <td>₹{Number(inv.sgst).toFixed(2)}</td>
                      <td>₹{Number(inv.igst).toFixed(2)}</td>
                      <td className="font-semibold">₹{Number(inv.totalInvoiceValue).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(gstr1Data?.b2b ?? []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-muted">No invoices to registered buyers yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h3 className="font-display text-base font-semibold mb-2">Credit notes to registered buyers</h3>
              <table className="ledger">
                <thead>
                  <tr>
                    <th scope="col">Credit note</th>
                    <th scope="col">Against invoice</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">GSTIN</th>
                    <th scope="col">Taxable</th>
                    <th scope="col">CGST</th>
                    <th scope="col">SGST</th>
                    <th scope="col">IGST</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(gstr1Data?.creditNotes ?? []).map((n) => (
                    <tr key={n.id}>
                      <td className="font-mono font-semibold text-accent-deep">{n.creditNoteNumber}</td>
                      <td className="font-mono text-xs">{n.invoiceNumber}</td>
                      <td className="font-semibold text-ink">{n.customerName}</td>
                      <td className="font-mono text-[11px]">{n.customerGstin}</td>
                      <td>₹{Number(n.taxableValue).toFixed(2)}</td>
                      <td>₹{Number(n.cgst).toFixed(2)}</td>
                      <td>₹{Number(n.sgst).toFixed(2)}</td>
                      <td>₹{Number(n.igst).toFixed(2)}</td>
                      <td className="font-semibold">₹{Number(n.total).toFixed(2)}</td>
                    </tr>
                  ))}
                  {(gstr1Data?.creditNotes ?? []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="text-muted">No credit notes yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: GSTR-2 Inward Supplies & Input Tax Credit (ITC) */}
      </div>
    </div>
  );
}
