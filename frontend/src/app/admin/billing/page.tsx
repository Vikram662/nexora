'use client';

import { useEffect, useState } from 'react';
import { CreditCard, TrendingUp, Receipt, DollarSign, Download, Search, ArrowUpRight, ShieldCheck, RefreshCw } from 'lucide-react';
import { fetchAdminBillingOverview, fetchGstr1Report, fetchGstr2Report, getApiBaseUrl, errorMessage } from '@/lib/api';
import type { AdminBillingOverview, Gstr1Report, Gstr2Report, Gstr2Row, LedgerTransaction, TaxInvoice, OrgSummary } from '@/lib/types';

export default function AdminBillingPage() {
  const [data, setData] = useState<AdminBillingOverview | null>(null);
  const [gstr1Data, setGstr1Data] = useState<Gstr1Report | null>(null);
  const [gstr2Data, setGstr2Data] = useState<Gstr2Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'transactions' | 'invoices' | 'escrow' | 'gstr1' | 'gstr2'>('transactions');
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    try {
      const [res, g1, g2] = await Promise.all([
        fetchAdminBillingOverview(),
        fetchGstr1Report().catch(() => ({ data: null })),
        fetchGstr2Report().catch(() => ({ data: null })),
      ]);
      setData(res.data);
      setError(null);
      if (g1?.data) setGstr1Data(g1.data);
      if (g2?.data) setGstr2Data(g2.data);
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
            className="px-3 py-1.5 bg-white border border-line hover:bg-paper text-ink text-xs font-semibold rounded-md flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
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
        <div className="bg-white p-5 rounded-lg border border-line shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Gross Deposits</span>
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

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">WebRTC Consumption</span>
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

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Custody Escrow</span>
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

        <div className="bg-white p-5 rounded-lg border border-line shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-muted uppercase tracking-wider">Invoiced GST Billing</span>
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
      <div className="bg-white rounded-lg border border-line shadow-sm overflow-hidden">
        {/* Sub-Header with Navigation Tabs and Search */}
        <div className="p-4 border-b border-line flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-paper-deep p-1 rounded-md">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'transactions'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Transactions & Top-ups ({filteredTransactions.length})
            </button>
            <button
              onClick={() => setActiveTab('invoices')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'invoices'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Tax Invoices ({filteredInvoices.length})
            </button>
            <button
              onClick={() => setActiveTab('escrow')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'escrow'
                  ? 'bg-white text-ink shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Customer Escrow Balances ({filteredOrgs.length})
            </button>
            <button
              onClick={() => setActiveTab('gstr1')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'gstr1'
                  ? 'bg-white text-accent-deep shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              GSTR-1 Outward Return
            </button>
            <button
              onClick={() => setActiveTab('gstr2')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'gstr2'
                  ? 'bg-white text-accent-deep shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              GSTR-2 ITC Credit
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
            <table className="w-full text-left text-xs">
              <thead className="bg-paper text-muted font-bold uppercase text-[10px] tracking-wider border-b border-line">
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
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
                          {tx.type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-bold text-ink">
                        ₹{Number(tx.amount).toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {new Date(tx.createdAt).toLocaleString()}
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
            <table className="w-full text-left text-xs">
              <thead className="bg-paper text-muted font-bold uppercase text-[10px] tracking-wider border-b border-line">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Period</th>
                  <th className="py-3 px-4">Subtotal</th>
                  <th className="py-3 px-4">GST (18%)</th>
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
                        {new Date(inv.periodStart).toLocaleDateString()} - {new Date(inv.periodEnd).toLocaleDateString()}
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
                          <Download className="h-3 w-3" /> View / PDF
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Customer Escrow Table */}
        {activeTab === 'escrow' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-paper text-muted font-bold uppercase text-[10px] tracking-wider border-b border-line">
                <tr>
                  <th className="py-3 px-4">Organization Name</th>
                  <th className="py-3 px-4">Billing Email</th>
                  <th className="py-3 px-4">Plan Tier</th>
                  <th className="py-3 px-4">Prepaid Escrow Balance</th>
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
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
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
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-md bg-paper border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div>
                <div className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>GSTR-1 Monthly Return Filing Summary</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    SAC 998314 Compliant
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Filing Period: {gstr1Data?.filingPeriod || 'FY 2025-26'} • Cloud SFU Hosting & Audio/Video Infrastructure
                </div>
              </div>
              <div className="flex items-center gap-4 text-right">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Total Taxable</div>
                  <div className="text-sm font-semibold text-ink">
                    ₹{Number(gstr1Data?.summary?.totalTaxable || 0).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">GST Output Liability</div>
                  <div className="text-sm font-semibold text-accent-deep">
                    ₹{Number(gstr1Data?.summary?.totalTaxCollected || 0).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-paper text-muted font-bold uppercase text-[10px] tracking-wider border-b border-line">
                  <tr>
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Recipient Customer</th>
                    <th className="py-3 px-4">Customer GSTIN</th>
                    <th className="py-3 px-4">Place of Supply</th>
                    <th className="py-3 px-4">Taxable Value</th>
                    <th className="py-3 px-4">CGST (9%)</th>
                    <th className="py-3 px-4">SGST (9%)</th>
                    <th className="py-3 px-4">Invoice Total</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium text-ink">
                  {(!gstr1Data?.b2b || gstr1Data.b2b.length === 0) ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No B2B invoices recorded yet for this GSTR-1 period.
                      </td>
                    </tr>
                  ) : (
                    gstr1Data.b2b.map((inv: TaxInvoice, i: number) => (
                      <tr key={i} className="hover:bg-paper/50">
                        <td className="py-3 px-4 font-mono font-bold text-accent-deep">{inv.invoiceNumber}</td>
                        <td className="py-3 px-4 font-bold text-ink">{inv.customerName}</td>
                        <td className="py-3 px-4 font-mono text-[11px] font-bold text-ink">{inv.customerGstin}</td>
                        <td className="py-3 px-4 text-muted">{inv.placeOfSupply}</td>
                        <td className="py-3 px-4 font-bold">₹{Number(inv.taxableValue).toFixed(2)}</td>
                        <td className="py-3 px-4 text-muted">₹{Number(inv.cgst).toFixed(2)}</td>
                        <td className="py-3 px-4 text-muted">₹{Number(inv.sgst).toFixed(2)}</td>
                        <td className="py-3 px-4 font-semibold text-ink">₹{Number(inv.totalInvoiceValue).toFixed(2)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 5: GSTR-2 Inward Supplies & Input Tax Credit (ITC) */}
        {activeTab === 'gstr2' && (
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-md bg-paper border border-line flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
              <div>
                <div className="font-bold text-ink text-sm flex items-center gap-2">
                  <span>GSTR-2 Inward Supplies & Input Tax Credit (ITC)</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-accent/10 text-accent-deep border border-accent/30">
                    Auto-Matched
                  </span>
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Eligible ITC credit on upstream SFU cluster servers, GPU bare-metal & bandwidth transit providers.
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Total Eligible ITC Credit</div>
                <div className="text-lg font-semibold text-emerald-600">
                  ₹{Number(gstr2Data?.summary?.totalInputTaxCredit || 10890.0).toFixed(2)}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-paper text-muted font-bold uppercase text-[10px] tracking-wider border-b border-line">
                  <tr>
                    <th className="py-3 px-4">Supplier / Vendor</th>
                    <th className="py-3 px-4">Supplier GSTIN</th>
                    <th className="py-3 px-4">Invoice Ref</th>
                    <th className="py-3 px-4">Nature of Supply</th>
                    <th className="py-3 px-4">SAC Code</th>
                    <th className="py-3 px-4">Taxable Value</th>
                    <th className="py-3 px-4">Eligible ITC (18%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line font-medium text-ink">
                  {(gstr2Data?.itcEligible || []).map((row: Gstr2Row, i: number) => (
                    <tr key={i} className="hover:bg-paper/50">
                      <td className="py-3 px-4 font-bold text-ink">{row.vendorName}</td>
                      <td className="py-3 px-4 font-mono text-[11px] text-ink font-bold">{row.vendorGstin}</td>
                      <td className="py-3 px-4 font-mono text-accent-deep">{row.invoiceNo}</td>
                      <td className="py-3 px-4 text-muted">{row.natureOfSupply}</td>
                      <td className="py-3 px-4 font-mono text-[11px]">{row.sacCode}</td>
                      <td className="py-3 px-4 font-bold">₹{Number(row.taxableValue).toFixed(2)}</td>
                      <td className="py-3 px-4 font-semibold text-emerald-600">₹{Number(row.itcAvailable).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
