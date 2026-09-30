import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { CreditNoteService } from './credit-note.service.js';
import { isRenderableCreditNote, renderCreditNoteHtml } from './credit-note.render.js';
import { formatCreditNoteNumber } from './invoice-math.js';

const snapshot = {
  supplier: { legalName: 'Acme', gstin: '27AAPFU0939F1ZV', address: 'Mumbai', stateCode: '27', stateName: 'Maharashtra' },
  recipient: { legalName: 'Buyer <b>Ltd</b>', gstin: '29ABCDE1234F1Z5', addressLines: ['5 Lake Rd'], stateCode: '29', stateName: 'Karnataka' },
  sacCode: '998314',
  gstPercent: 18,
  placeOfSupply: 'Karnataka (29)',
  reverseCharge: false,
  issuedAt: '2026-09-05T00:00:00.000Z',
  lines: [{ roomType: 'VIDEO_CALL', description: 'Video call sessions', quantityMinutes: 10, taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalPaise: 11800 }],
};

// A ₹118 inter-state invoice: ₹100 taxable + ₹18 IGST.
const invoice = {
  id: 'inv_1',
  organizationId: 'org_1',
  invoiceNumber: 'NXR/2627/000007',
  createdAt: new Date('2026-09-05T00:00:00Z'),
  subtotal: 100,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 18,
  totalAmount: 118,
  billingSnapshot: snapshot,
};

describe('CreditNoteService', () => {
  const now = new Date('2026-10-01T00:00:00Z');
  let prisma: any;
  let tx: any;
  let notifications: any;
  let service: CreditNoteService;

  beforeEach(() => {
    tx = {
      creditNote: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn(async ({ data }: any) => ({ id: 'cn_1', ...data })),
      },
      invoiceCounter: { upsert: vi.fn().mockResolvedValue({ lastSerial: 3 }) },
      organization: { update: vi.fn().mockResolvedValue({ walletBalance: 618 }) },
      transaction: { create: vi.fn().mockResolvedValue({}) },
    };
    prisma = {
      invoice: { findUnique: vi.fn().mockResolvedValue(invoice) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    service = new CreditNoteService(prisma, notifications);
  });

  it('issues a numbered credit note, splits IGST like the invoice and credits the wallet', async () => {
    const note = await service.issue({ invoiceId: 'inv_1', amount: 59, reason: 'Session ended early', now });
    expect(note.creditNoteNumber).toBe('NXC/2627/000003');
    expect(tx.invoiceCounter.upsert.mock.calls[0][0].where).toEqual({ financialYear: 'CN-2026-27' });
    expect(tx.creditNote.create.mock.calls[0][0].data).toMatchObject({ taxableAmount: 50, igstAmount: 9, cgstAmount: 0, sgstAmount: 0, totalAmount: 59, serial: 3 });
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { walletBalance: { increment: 59 } },
      select: { walletBalance: true },
    });
    expect(tx.transaction.create).toHaveBeenCalledWith({
      data: { organizationId: 'org_1', type: 'REFUND', amount: 59, status: 'SUCCESS', balanceAfter: 618 },
    });
    expect(notifications.queue).toHaveBeenCalledWith('org_1', 'REFUND_PROCESSED', { creditNoteId: 'cn_1', creditedToWallet: true });
  });

  it('can adjust the tax without touching the wallet', async () => {
    await service.issue({ invoiceId: 'inv_1', amount: 59, reason: 'Settled outside the wallet', creditToWallet: false, now });
    expect(tx.organization.update).not.toHaveBeenCalled();
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it('refuses to credit more than what is left on the invoice', async () => {
    tx.creditNote.findMany.mockResolvedValue([{ taxableAmount: 80, cgstAmount: 0, sgstAmount: 0, igstAmount: 14.4, totalAmount: 94.4 }]);
    await expect(service.issue({ invoiceId: 'inv_1', amount: 30, reason: 'Too much', now })).rejects.toThrow(/23\.60 can still be credited/);
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it('makes the final credit note take exactly what is left, so notes add up to the invoice', async () => {
    tx.creditNote.findMany.mockResolvedValue([{ taxableAmount: 33.33, cgstAmount: 0, sgstAmount: 0, igstAmount: 6, totalAmount: 39.33 }]);
    await service.issue({ invoiceId: 'inv_1', amount: 78.67, reason: 'Full reversal', now });
    const data = tx.creditNote.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ taxableAmount: 66.67, igstAmount: 12, totalAmount: 78.67 });
  });

  it('uses CGST and SGST for an intra-state invoice', async () => {
    prisma.invoice.findUnique.mockResolvedValue({ ...invoice, igstAmount: 0, cgstAmount: 9, sgstAmount: 9 });
    await service.issue({ invoiceId: 'inv_1', amount: 59, reason: 'Session ended early', now });
    expect(tx.creditNote.create.mock.calls[0][0].data).toMatchObject({ cgstAmount: 4.5, sgstAmount: 4.5, igstAmount: 0 });
  });

  it('validates input before touching the database', async () => {
    await expect(service.issue({ invoiceId: 'inv_1', amount: 0, reason: 'Some reason' })).rejects.toThrow(BadRequestException);
    await expect(service.issue({ invoiceId: 'inv_1', amount: 10, reason: 'no' })).rejects.toThrow(/reason/);
    expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
  });

  it('rejects unknown invoices and legacy invoices with no tax record', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);
    await expect(service.issue({ invoiceId: 'nope', amount: 10, reason: 'Some reason' })).rejects.toThrow(NotFoundException);
    prisma.invoice.findUnique.mockResolvedValue({ ...invoice, billingSnapshot: {} });
    await expect(service.issue({ invoiceId: 'inv_1', amount: 10, reason: 'Some reason' })).rejects.toThrow(UnprocessableEntityException);
  });
});

describe('credit note rendering', () => {
  const noteSnapshot = {
    supplier: snapshot.supplier,
    recipient: snapshot.recipient,
    sacCode: '998314',
    gstPercent: 18,
    placeOfSupply: 'Karnataka (29)',
    reason: 'Session <script>x</script> ended early',
    issuedAt: '2026-10-01T00:00:00.000Z',
    originalInvoice: { number: 'NXR/2627/000007', date: '2026-09-05T00:00:00.000Z' },
    creditedToWallet: true,
  };

  it('refers to the original invoice, escapes text and shows the tax split', () => {
    expect(isRenderableCreditNote(noteSnapshot)).toBe(true);
    const html = renderCreditNoteHtml(
      { creditNoteNumber: 'NXC/2627/000003', createdAt: new Date('2026-10-01'), taxableAmount: 50, cgstAmount: 0, sgstAmount: 0, igstAmount: 9, totalAmount: 59 },
      noteSnapshot,
    );
    for (const needle of ['NXC/2627/000003', 'NXR/2627/000007', '27AAPFU0939F1ZV', 'IGST', 'Karnataka (29)', 'added back to the wallet']) {
      expect(html).toContain(needle);
    }
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('numbers credit notes in their own series', () => {
    expect(formatCreditNoteNumber('2026-27', 1)).toBe('NXC/2627/000001');
    expect(isRenderableCreditNote({})).toBe(false);
  });
});
