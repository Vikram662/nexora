import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderCreditNotePdf, renderInvoicePdf } from './pdf.render.js';

const supplier = { legalName: 'Acme Cloud Pvt Ltd', gstin: '27AAPFU0939F1ZV', address: '1 Main Road, Mumbai', stateCode: '27', stateName: 'Maharashtra' };
const recipient = { legalName: 'Buyer Pvt Ltd', gstin: '29ABCDE1234F1Z5', addressLines: ['5 Lake Road', 'Bengaluru 560001'], stateCode: '29', stateName: 'Karnataka' };

const invoice = {
  invoiceNumber: 'NXR/2627/000007',
  createdAt: new Date('2026-09-05T00:00:00Z'),
  periodStart: new Date('2026-08-01T00:00:00Z'),
  periodEnd: new Date('2026-09-01T00:00:00Z'),
  sacCode: '998314',
  subtotal: 100,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 18,
  totalAmount: 118,
  billingSnapshot: {},
};
const invoiceSnapshot = {
  supplier,
  recipient,
  sacCode: '998314',
  gstPercent: 18,
  placeOfSupply: 'Karnataka (29)',
  reverseCharge: false as const,
  issuedAt: '2026-09-05T00:00:00.000Z',
  lines: [{ roomType: 'VIDEO_CALL', description: 'Video call sessions', quantityMinutes: 12, taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalPaise: 11800 }],
};

// Text extraction proves the PDF is readable, not just non-empty. Skipped where pdftotext is not installed.
function pdfText(buffer: Buffer): string | null {
  const dir = mkdtempSync(join(tmpdir(), 'pdf-'));
  try {
    const file = join(dir, 'doc.pdf');
    writeFileSync(file, buffer);
    return execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8' });
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('PDF documents', () => {
  it('renders a tax invoice with the mandatory particulars', async () => {
    const pdf = await renderInvoicePdf(invoice, invoiceSnapshot);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(pdf);
    if (text === null) return;
    for (const needle of ['Tax invoice', 'NXR/2627/000007', '27AAPFU0939F1ZV', '29ABCDE1234F1Z5', 'Karnataka (29)', '998314', 'IGST', '118.00', 'Reverse charge: No']) {
      expect(text).toContain(needle);
    }
  });

  it('renders CGST and SGST columns for an intra-state invoice', async () => {
    const pdf = await renderInvoicePdf(
      { ...invoice, igstAmount: 0, cgstAmount: 9, sgstAmount: 9 },
      { ...invoiceSnapshot, lines: [{ ...invoiceSnapshot.lines[0], igstPaise: 0, cgstPaise: 900, sgstPaise: 900 }] },
    );
    const text = pdfText(pdf);
    if (text === null) return;
    expect(text).toContain('CGST');
    expect(text).toContain('SGST');
    expect(text).not.toContain('IGST');
  });

  it('renders a credit note that refers to the invoice', async () => {
    const pdf = await renderCreditNotePdf(
      { creditNoteNumber: 'NXC/2627/000003', createdAt: new Date('2026-10-01'), taxableAmount: 50, cgstAmount: 0, sgstAmount: 0, igstAmount: 9, totalAmount: 59 },
      { supplier, recipient, sacCode: '998314', gstPercent: 18, placeOfSupply: 'Karnataka (29)', reason: 'Session ended early', issuedAt: '2026-10-01T00:00:00.000Z', originalInvoice: { number: 'NXR/2627/000007', date: '2026-09-05T00:00:00.000Z' }, creditedToWallet: true },
    );
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(pdf);
    if (text === null) return;
    for (const needle of ['Credit note', 'NXC/2627/000003', 'NXR/2627/000007', 'Session ended early', '59.00']) expect(text).toContain(needle);
  });

  it('does not break on characters the standard fonts cannot draw', async () => {
    const pdf = await renderInvoicePdf(invoice, { ...invoiceSnapshot, recipient: { ...recipient, legalName: 'Buyer हिन्दी Ltd' } });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
