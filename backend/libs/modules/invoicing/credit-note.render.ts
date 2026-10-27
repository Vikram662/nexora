import { formatRupees } from './invoice-math.js';
import type { InvoiceSnapshot } from './invoice.service.js';

export interface CreditNoteSnapshot {
  supplier: InvoiceSnapshot['supplier'];
  recipient: InvoiceSnapshot['recipient'];
  sacCode: string;
  gstPercent: number;
  placeOfSupply: string;
  reason: string;
  issuedAt: string;
  originalInvoice: { number: string; date: string };
  creditedToWallet: boolean;
}

export interface PrintableCreditNote {
  creditNoteNumber: string;
  createdAt: Date;
  taxableAmount: unknown;
  cgstAmount: unknown;
  sgstAmount: unknown;
  igstAmount: unknown;
  totalAmount: unknown;
}

const esc = (value: unknown) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const paise = (rupees: unknown) => Math.round(Number(rupees) * 100);
const date = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function isRenderableCreditNote(value: unknown): value is CreditNoteSnapshot {
  const s = value as CreditNoteSnapshot | null;
  return Boolean(s && s.supplier?.gstin && s.recipient?.legalName && s.originalInvoice?.number);
}

/** Printable credit note carrying the particulars Section 34 of the CGST Act and Rule 53 expect. */
export function renderCreditNoteHtml(note: PrintableCreditNote, snap: CreditNoteSnapshot): string {
  const interState = paise(note.igstAmount) > 0;
  const half = snap.gstPercent / 2;
  const taxRows = interState
    ? `<div><span>IGST (${snap.gstPercent}%)</span><span>₹${formatRupees(paise(note.igstAmount))}</span></div>`
    : `<div><span>CGST (${half}%)</span><span>₹${formatRupees(paise(note.cgstAmount))}</span></div>
       <div><span>SGST (${half}%)</span><span>₹${formatRupees(paise(note.sgstAmount))}</span></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Credit note ${esc(note.creditNoteNumber)}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #171b34; margin: 0; padding: 24px; background: #eef0f4; font-size: 13px; }
  .sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 36px; border-top: 3px solid #171b34; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .head, .parties { display: flex; justify-content: space-between; gap: 32px; }
  .head { padding-bottom: 20px; border-bottom: 1px solid #d5d9e2; }
  .parties { margin: 20px 0; }
  .parties > div { flex: 1; }
  .label { color: #566079; font-size: 11px; margin-bottom: 4px; }
  .meta td { padding: 2px 0 2px 16px; }
  .totals { margin: 20px 0 0 auto; width: 320px; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-variant-numeric: tabular-nums; }
  .totals .grand { border-top: 2px solid #171b34; margin-top: 6px; padding-top: 8px; font-weight: 700; font-size: 15px; }
  .reason { margin: 20px 0; padding: 12px 0; border-top: 1px solid #d5d9e2; border-bottom: 1px solid #d5d9e2; }
  .foot { margin-top: 28px; color: #566079; font-size: 11px; line-height: 1.5; }
  @media print { body { background: #fff; padding: 0; } .sheet { border-top: 0; padding: 0; } }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div>
      <h1>${esc(snap.supplier.legalName)}</h1>
      <div>${esc(snap.supplier.address).replace(/\n/g, '<br>')}</div>
      <div>GSTIN: ${esc(snap.supplier.gstin)}</div>
      <div>State: ${esc(snap.supplier.stateName)} (${esc(snap.supplier.stateCode)})</div>
    </div>
    <div>
      <h1>Credit note</h1>
      <table class="meta">
        <tr><td class="label">Credit note number</td><td><strong>${esc(note.creditNoteNumber)}</strong></td></tr>
        <tr><td class="label">Date of issue</td><td>${date(note.createdAt)}</td></tr>
        <tr><td class="label">Against invoice</td><td>${esc(snap.originalInvoice.number)} dated ${date(snap.originalInvoice.date)}</td></tr>
      </table>
    </div>
  </div>

  <div class="parties">
    <div>
      <div class="label">Issued to</div>
      <strong>${esc(snap.recipient.legalName)}</strong><br>
      ${snap.recipient.addressLines.map(esc).join('<br>')}<br>
      GSTIN: ${snap.recipient.gstin ? esc(snap.recipient.gstin) : 'Unregistered'}
    </div>
    <div>
      <div class="label">Place of supply</div>
      <strong>${esc(snap.placeOfSupply)}</strong><br>
      <span class="label">SAC ${esc(snap.sacCode)}</span>
    </div>
  </div>

  <div class="reason"><div class="label">Reason</div>${esc(snap.reason)}</div>

  <div class="totals">
    <div><span>Taxable value reduced</span><span>₹${formatRupees(paise(note.taxableAmount))}</span></div>
    ${taxRows}
    <div class="grand"><span>Credit note total</span><span>₹${formatRupees(paise(note.totalAmount))}</span></div>
  </div>

  <p class="foot">
    This credit note reduces the taxable value and tax on the invoice named above.
    ${snap.creditedToWallet ? 'The total was added back to the wallet balance.' : 'The total was not added to the wallet balance.'}
    This is a computer-generated document.
  </p>
</div>
</body>
</html>`;
}
