import PDFDocument from 'pdfkit';
import { formatRupees } from './invoice-math.js';
import type { InvoiceSnapshot } from './invoice.service.js';
import type { CreditNoteSnapshot, PrintableCreditNote } from './credit-note.render.js';
import type { PrintableInvoice } from './invoice.render.js';

// Standard PDF fonts cover Latin text only, so amounts are written as "Rs." and any other character becomes "?".
const safe = (value: unknown) =>
  String(value ?? '')
    .normalize('NFC')
    .replace(/[^\x20-\x7E -ÿ\n]/g, '?');
const paise = (rupees: unknown) => Math.round(Number(rupees) * 100);
const money = (p: number) => `Rs. ${formatRupees(p)}`;
const day = (d: Date | string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

const INK = '#171b34';
const MUTED = '#566079';
const LINE = '#d5d9e2';
const LEFT = 40;
const WIDTH = 515; // A4 width 595 minus 40 margins

function toBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: LEFT, info: { Producer: 'Nexora' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      build(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function label(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width?: number) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(safe(text), x, y, { width });
}

function rule(doc: PDFKit.PDFDocument, y: number, color = LINE, weight = 0.5) {
  doc.moveTo(LEFT, y).lineTo(LEFT + WIDTH, y).lineWidth(weight).strokeColor(color).stroke();
}

function header(doc: PDFKit.PDFDocument, title: string, supplier: InvoiceSnapshot['supplier'], meta: [string, string][]) {
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(safe(supplier.legalName), LEFT, 40, { width: 280 });
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  doc.text(safe(supplier.address), { width: 280 });
  doc.text(`GSTIN: ${safe(supplier.gstin)}`);
  doc.text(`State: ${safe(supplier.stateName)} (${safe(supplier.stateCode)})`);
  const leftEnd = doc.y;

  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(title, 340, 40, { width: 215, align: 'right' });
  let y = 64;
  for (const [k, v] of meta) {
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(safe(k), 340, y, { width: 215, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(safe(v), 340, y + 10, { width: 215, align: 'right' });
    y += 26;
  }
  const bottom = Math.max(leftEnd, y) + 8;
  rule(doc, bottom);
  return bottom + 14;
}

function parties(doc: PDFKit.PDFDocument, y: number, recipient: InvoiceSnapshot['recipient'], placeOfSupply: string, heading: string, extra?: string) {
  label(doc, heading, LEFT, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(safe(recipient.legalName), LEFT, y + 11, { width: 250 });
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  for (const line of recipient.addressLines) doc.text(safe(line), { width: 250 });
  doc.text(`GSTIN: ${recipient.gstin ? safe(recipient.gstin) : 'Unregistered'}`);
  const leftEnd = doc.y;

  label(doc, 'Place of supply', 320, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(safe(placeOfSupply), 320, y + 11, { width: 235 });
  if (extra) doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(safe(extra), 320, doc.y + 2, { width: 235 });
  return Math.max(leftEnd, doc.y) + 16;
}

function totalsBlock(doc: PDFKit.PDFDocument, y: number, rows: [string, string][], grand: [string, string]) {
  const x = LEFT + WIDTH - 230;
  for (const [k, v] of rows) {
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(safe(k), x, y, { width: 120 });
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(v, x + 120, y, { width: 110, align: 'right' });
    y += 16;
  }
  doc.moveTo(x, y + 2).lineTo(x + 230, y + 2).lineWidth(1.2).strokeColor(INK).stroke();
  y += 8;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(safe(grand[0]), x, y, { width: 120 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text(grand[1], x + 120, y, { width: 110, align: 'right' });
  return y + 26;
}

/** Tax invoice PDF with the particulars required by Rule 46 of the CGST Rules. */
export function renderInvoicePdf(invoice: PrintableInvoice, snap: InvoiceSnapshot): Promise<Buffer> {
  return toBuffer((doc) => {
    const interState = paise(invoice.igstAmount) > 0;
    const rate = snap.gstPercent;
    const half = rate / 2;

    let y = header(doc, 'Tax invoice', snap.supplier, [
      ['Invoice number', invoice.invoiceNumber],
      ['Date of issue', day(invoice.createdAt)],
      ['Service period', `${day(invoice.periodStart)} to ${day(new Date(invoice.periodEnd.getTime() - 1))}`],
    ]);
    y = parties(doc, y, snap.recipient, snap.placeOfSupply, 'Billed to', 'Reverse charge: No');

    // Table columns: [heading, width, align]
    const cols: [string, number, 'left' | 'right'][] = interState
      ? [['Description', 150, 'left'], ['SAC', 50, 'left'], ['Minutes', 45, 'right'], ['Taxable (Rs.)', 80, 'right'], ['%', 40, 'right'], ['IGST (Rs.)', 70, 'right'], ['Total (Rs.)', 80, 'right']]
      : [['Description', 105, 'left'], ['SAC', 45, 'left'], ['Min', 32, 'right'], ['Taxable', 62, 'right'], ['%', 32, 'right'], ['CGST', 50, 'right'], ['%', 32, 'right'], ['SGST', 50, 'right'], ['Total', 92, 'right']];
    const drawRow = (cells: string[], top: number, bold = false) => {
      let x = LEFT;
      cols.forEach(([, w, align], i) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(bold ? MUTED : INK);
        doc.text(safe(cells[i]), x, top, { width: w - 6, align });
        x += w;
      });
    };

    drawRow(cols.map((c) => c[0]), y, true);
    y += 14;
    rule(doc, y, INK, 0.8);
    y += 6;
    for (const line of snap.lines) {
      const cells = interState
        ? [line.description, snap.sacCode, String(line.quantityMinutes), formatRupees(line.taxablePaise), `${rate}%`, formatRupees(line.igstPaise), formatRupees(line.totalPaise)]
        : [line.description, snap.sacCode, String(line.quantityMinutes), formatRupees(line.taxablePaise), `${half}%`, formatRupees(line.cgstPaise), `${half}%`, formatRupees(line.sgstPaise), formatRupees(line.totalPaise)];
      drawRow(cells, y);
      y += 18;
      rule(doc, y - 4);
    }

    y += 8;
    const rows: [string, string][] = [['Taxable value', money(paise(invoice.subtotal))]];
    if (interState) rows.push([`IGST (${rate}%)`, money(paise(invoice.igstAmount))]);
    else rows.push([`CGST (${half}%)`, money(paise(invoice.cgstAmount))], [`SGST (${half}%)`, money(paise(invoice.sgstAmount))]);
    y = totalsBlock(doc, y, rows, ['Invoice total', money(paise(invoice.totalAmount))]);

    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text('This is a computer-generated invoice. Charges were deducted from your prepaid wallet as sessions ran.', LEFT, y + 10, { width: WIDTH });
  });
}

/** Credit note PDF with the particulars Section 34 of the CGST Act and Rule 53 expect. */
export function renderCreditNotePdf(note: PrintableCreditNote, snap: CreditNoteSnapshot): Promise<Buffer> {
  return toBuffer((doc) => {
    const interState = paise(note.igstAmount) > 0;
    const half = snap.gstPercent / 2;

    let y = header(doc, 'Credit note', snap.supplier, [
      ['Credit note number', note.creditNoteNumber],
      ['Date of issue', day(note.createdAt)],
      ['Against invoice', `${snap.originalInvoice.number} dated ${day(snap.originalInvoice.date)}`],
    ]);
    y = parties(doc, y, snap.recipient, snap.placeOfSupply, 'Issued to', `SAC ${snap.sacCode}`);

    rule(doc, y);
    label(doc, 'Reason', LEFT, y + 8);
    doc.font('Helvetica').fontSize(10).fillColor(INK).text(safe(snap.reason), LEFT, y + 20, { width: WIDTH });
    y = doc.y + 8;
    rule(doc, y);
    y += 16;

    const rows: [string, string][] = [['Taxable value reduced', money(paise(note.taxableAmount))]];
    if (interState) rows.push([`IGST (${snap.gstPercent}%)`, money(paise(note.igstAmount))]);
    else rows.push([`CGST (${half}%)`, money(paise(note.cgstAmount))], [`SGST (${half}%)`, money(paise(note.sgstAmount))]);
    y = totalsBlock(doc, y, rows, ['Credit note total', money(paise(note.totalAmount))]);

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `This credit note reduces the taxable value and tax on the invoice named above. ${snap.creditedToWallet ? 'The total was added back to the wallet balance.' : 'The total was not added to the wallet balance.'} This is a computer-generated document.`,
        LEFT,
        y + 10,
        { width: WIDTH },
      );
  });
}
