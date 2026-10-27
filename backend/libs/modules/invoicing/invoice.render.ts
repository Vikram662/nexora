import { formatRupees } from './invoice-math.js';
import type { InvoiceLine, InvoiceSnapshot } from './invoice.service.js';

export interface PrintableInvoice {
  invoiceNumber: string;
  createdAt: Date;
  periodStart: Date;
  periodEnd: Date;
  sacCode: string;
  subtotal: unknown;
  cgstAmount: unknown;
  sgstAmount: unknown;
  igstAmount: unknown;
  totalAmount: unknown;
  billingSnapshot: unknown;
}

const escapeHtml = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const paise = (rupees: unknown) => Math.round(Number(rupees) * 100);
const date = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function isRenderableSnapshot(value: unknown): value is InvoiceSnapshot {
  const s = value as InvoiceSnapshot | null;
  return Boolean(s && s.supplier?.gstin && s.recipient?.legalName && Array.isArray(s.lines) && s.lines.length);
}

/** Self-contained printable tax invoice carrying the particulars required by Rule 46 of the CGST Rules. */
export function renderInvoiceHtml(invoice: PrintableInvoice, snap: InvoiceSnapshot): string {
  const interState = paise(invoice.igstAmount) > 0;
  const rate = snap.gstPercent;
  const halfRate = rate / 2;

  const rows = snap.lines
    .map(
      (l: InvoiceLine) => `
        <tr>
          <td>${escapeHtml(l.description)}</td>
          <td>${escapeHtml(snap.sacCode)}</td>
          <td class="num">${l.quantityMinutes}</td>
          <td class="num">${formatRupees(l.taxablePaise)}</td>
          ${
            interState
              ? `<td class="num">${rate}%</td><td class="num">${formatRupees(l.igstPaise)}</td>`
              : `<td class="num">${halfRate}%</td><td class="num">${formatRupees(l.cgstPaise)}</td><td class="num">${halfRate}%</td><td class="num">${formatRupees(l.sgstPaise)}</td>`
          }
          <td class="num">${formatRupees(l.totalPaise)}</td>
        </tr>`,
    )
    .join('');

  const taxHead = interState ? '<th colspan="2">IGST</th>' : '<th colspan="2">CGST</th><th colspan="2">SGST</th>';
  const taxSub = interState ? '<th>Rate</th><th>Amount</th>' : '<th>Rate</th><th>Amount</th><th>Rate</th><th>Amount</th>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tax Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #171b34; margin: 0; padding: 24px; background: #eef0f4; font-size: 13px; }
  .sheet { max-width: 900px; margin: 0 auto; background: #fff; padding: 36px; border-top: 3px solid #171b34; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .head, .parties { display: flex; justify-content: space-between; gap: 32px; }
  .head { padding-bottom: 20px; border-bottom: 1px solid #d5d9e2; }
  .parties { margin: 20px 0; }
  .parties > div { flex: 1; }
  .label { color: #566079; font-size: 11px; margin-bottom: 4px; }
  .meta td { padding: 2px 0 2px 16px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th { text-align: left; font-weight: 500; color: #566079; border-bottom: 1px solid #171b34; padding: 8px 8px 8px 0; font-size: 12px; }
  table.items td { border-bottom: 1px solid #d5d9e2; padding: 10px 8px 10px 0; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { margin: 20px 0 0 auto; width: 320px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .grand { border-top: 2px solid #171b34; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .foot { margin-top: 28px; color: #566079; font-size: 11px; line-height: 1.5; }
  @media print { body { background: #fff; padding: 0; } .sheet { border-top: 0; padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div>
      <h1>${escapeHtml(snap.supplier.legalName)}</h1>
      <div>${escapeHtml(snap.supplier.address).replace(/\n/g, '<br>')}</div>
      <div>GSTIN: ${escapeHtml(snap.supplier.gstin)}</div>
      <div>State: ${escapeHtml(snap.supplier.stateName)} (${escapeHtml(snap.supplier.stateCode)})</div>
    </div>
    <div>
      <h1>Tax invoice</h1>
      <table class="meta">
        <tr><td class="label">Invoice number</td><td><strong>${escapeHtml(invoice.invoiceNumber)}</strong></td></tr>
        <tr><td class="label">Date of issue</td><td>${date(invoice.createdAt)}</td></tr>
        <tr><td class="label">Service period</td><td>${date(invoice.periodStart)} to ${date(new Date(invoice.periodEnd.getTime() - 1))}</td></tr>
        <tr><td class="label">Reverse charge</td><td>No</td></tr>
      </table>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="label">Billed to</div>
      <strong>${escapeHtml(snap.recipient.legalName)}</strong><br>
      ${snap.recipient.addressLines.map(escapeHtml).join('<br>')}<br>
      GSTIN: ${snap.recipient.gstin ? escapeHtml(snap.recipient.gstin) : 'Unregistered'}
    </div>
    <div>
      <div class="label">Place of supply</div>
      <strong>${escapeHtml(snap.placeOfSupply)}</strong>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr><th rowspan="2">Description of service</th><th rowspan="2">SAC</th><th rowspan="2" class="num">Minutes</th><th rowspan="2" class="num">Taxable value (₹)</th>${taxHead}<th rowspan="2" class="num">Total (₹)</th></tr>
      <tr>${taxSub}</tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="totals">
    <div><span>Taxable value</span><span class="num">₹${formatRupees(paise(invoice.subtotal))}</span></div>
    ${
      interState
        ? `<div><span>IGST (${rate}%)</span><span class="num">₹${formatRupees(paise(invoice.igstAmount))}</span></div>`
        : `<div><span>CGST (${halfRate}%)</span><span class="num">₹${formatRupees(paise(invoice.cgstAmount))}</span></div>
           <div><span>SGST (${halfRate}%)</span><span class="num">₹${formatRupees(paise(invoice.sgstAmount))}</span></div>`
    }
    <div class="grand"><span>Invoice total</span><span class="num">₹${formatRupees(paise(invoice.totalAmount))}</span></div>
  </div>

  <p class="foot">
    This is a computer-generated invoice. Charges were deducted from your prepaid wallet as sessions ran.
  </p>
</div>
</body>
</html>`;
}
