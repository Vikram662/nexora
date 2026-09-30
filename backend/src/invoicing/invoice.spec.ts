import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { financialYearOf, formatInvoiceNumber, monthRange, splitInclusiveTotal } from './invoice-math.js';
import { InvoiceService } from './invoice.service.js';
import { isRenderableSnapshot, renderInvoiceHtml } from './invoice.render.js';

describe('invoice math', () => {
  it('backs GST out of a GST-inclusive total and splits it CGST/SGST for same-state supply', () => {
    const r = splitInclusiveTotal(11800, 18, true);
    expect(r).toMatchObject({ taxablePaise: 10000, cgstPaise: 900, sgstPaise: 900, igstPaise: 0, totalPaise: 11800 });
  });

  it('charges IGST for inter-state supply', () => {
    const r = splitInclusiveTotal(11800, 18, false);
    expect(r).toMatchObject({ taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800 });
  });

  it('always adds up to the total, even when tax has an odd paisa', () => {
    for (const total of [1, 7, 99, 12345, 100001]) {
      const r = splitInclusiveTotal(total, 18, true);
      expect(r.taxablePaise + r.cgstPaise + r.sgstPaise).toBe(total);
    }
  });

  it('uses the April to March financial year', () => {
    expect(financialYearOf(new Date('2026-03-31T00:00:00Z'))).toBe('2025-26');
    expect(financialYearOf(new Date('2026-04-01T00:00:00Z'))).toBe('2026-27');
  });

  it('keeps invoice numbers within 16 characters of allowed symbols', () => {
    const n = formatInvoiceNumber('2026-27', 123);
    expect(n).toBe('NXR/2627/000123');
    expect(n.length).toBeLessThanOrEqual(16);
    expect(n).toMatch(/^[A-Z0-9/-]+$/);
  });
});

const SUPPLIER_SETTINGS = {
  gstPercent: 18,
  sacCode: '998314',
  supplierLegalName: 'Acme Cloud Pvt Ltd',
  supplierGstin: '27AAPFU0939F1ZV',
  supplierStateCode: '27',
  supplierAddress: '1 Main Road, Mumbai 400001',
};

describe('InvoiceService', () => {
  const start = monthRange(2026, 7).start; // 1 Aug 2026
  const end = monthRange(2026, 7).end; // 1 Sep 2026
  const now = new Date('2026-09-05T00:00:00Z');
  let tx: any;
  let prisma: any;
  let service: InvoiceService;
  let settings: any;

  const profile = (stateCode: string) => ({
    legalBusinessName: 'Buyer Pvt Ltd',
    gstin: '29ABCDE1234F1Z5',
    billingAddressLine1: '5 Lake Road',
    billingAddressLine2: null,
    city: 'Bengaluru',
    pincode: '560001',
    placeOfSupplyStateCode: stateCode,
  });

  beforeEach(() => {
    tx = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(async ({ data }: any) => ({ id: 'inv_1', ...data })),
      },
      usageLog: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'u1', roomType: 'VIDEO_CALL', billableSeconds: 600, amountDeducted: 59 },
          { id: 'u2', roomType: 'VIDEO_CALL', billableSeconds: 120, amountDeducted: 59 },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
      },
      invoiceCounter: { upsert: vi.fn().mockResolvedValue({ lastSerial: 7 }) },
    };
    prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ id: 'org_1', billingProfile: profile('29') }),
        findMany: vi.fn().mockResolvedValue([{ id: 'org_1' }]),
      },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    settings = {
      getBilling: vi.fn().mockResolvedValue({ ...SUPPLIER_SETTINGS }),
      getSnapshot: vi.fn().mockResolvedValue({ contact: { companyName: '', address: '' } }),
    };
    service = new InvoiceService(prisma, settings);
  });

  it('refuses to issue invoices without supplier details', async () => {
    settings.getBilling.mockResolvedValue({ ...SUPPLIER_SETTINGS, supplierGstin: '' });
    await expect(service.generateForOrganization('org_1', start, end, now)).rejects.toThrow(ServiceUnavailableException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('falls back to the public contact details for name and address', async () => {
    settings.getBilling.mockResolvedValue({ ...SUPPLIER_SETTINGS, supplierLegalName: '', supplierAddress: '' });
    settings.getSnapshot.mockResolvedValue({ contact: { companyName: 'Contact Name Ltd', address: 'Contact Address' } });
    await expect(service.getSupplier()).resolves.toMatchObject({ legalName: 'Contact Name Ltd', address: 'Contact Address' });
  });

  it('rejects a GSTIN whose state does not match the configured state code', async () => {
    settings.getBilling.mockResolvedValue({ ...SUPPLIER_SETTINGS, supplierStateCode: '29' });
    await expect(service.getSupplier()).rejects.toThrow(/state code/);
  });

  it('refuses to invoice a period that is not closed yet', async () => {
    await expect(service.generateForOrganization('org_1', start, end, new Date('2026-09-01T10:00:00Z'))).rejects.toThrow(/not closed/);
  });

  it('creates a numbered inter-state invoice, freezes the usage rows and stores a snapshot', async () => {
    const outcome = await service.generateForOrganization('org_1', start, end, now);
    expect(outcome).toMatchObject({ status: 'created', invoiceNumber: 'NXR/2627/000007' });
    const data = tx.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ subtotal: 100, igstAmount: 18, cgstAmount: 0, sgstAmount: 0, totalAmount: 118, serial: 7, financialYear: '2026-27' });
    expect(data.billingSnapshot.supplier.gstin).toBe('27AAPFU0939F1ZV');
    expect(tx.usageLog.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['u1', 'u2'] } }, data: { invoiceId: 'inv_1' } });
  });

  it('splits into CGST and SGST when buyer and supplier are in the same state', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org_1', billingProfile: profile('27') });
    await service.generateForOrganization('org_1', start, end, now);
    const data = tx.invoice.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ cgstAmount: 9, sgstAmount: 9, igstAmount: 0 });
  });

  it('is idempotent: an existing invoice for the period is left alone', async () => {
    tx.invoice.findUnique.mockResolvedValue({ id: 'existing' });
    const outcome = await service.generateForOrganization('org_1', start, end, now);
    expect(outcome.status).toBe('exists');
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.invoiceCounter.upsert).not.toHaveBeenCalled();
  });

  it('skips customers with no billing profile instead of inventing details', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org_1', billingProfile: null });
    const outcome = await service.generateForOrganization('org_1', start, end, now);
    expect(outcome.status).toBe('skipped');
    expect(tx.invoice.create).not.toHaveBeenCalled();
  });

  it('does nothing when there was no billable usage', async () => {
    tx.usageLog.findMany.mockResolvedValue([]);
    const outcome = await service.generateForOrganization('org_1', start, end, now);
    expect(outcome.status).toBe('no-usage');
    expect(tx.invoiceCounter.upsert).not.toHaveBeenCalled();
  });

  it('reports one failing organization without stopping the run', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'org_bad' }, { id: 'org_1' }]);
    prisma.organization.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === 'org_bad') throw new Error('boom');
      return { id: 'org_1', billingProfile: profile('29') };
    });
    const result = await service.generateForPeriod(start, end, now);
    expect(result.created).toBe(1);
    expect(result.skipped).toHaveLength(1);
  });
});

describe('invoice rendering', () => {
  const snapshot = {
    supplier: { legalName: 'Acme', gstin: '27AAPFU0939F1ZV', address: 'Mumbai', stateCode: '27', stateName: 'Maharashtra' },
    recipient: { legalName: '<script>alert(1)</script>', gstin: null, addressLines: ['5 Lake Rd'], stateCode: '29', stateName: 'Karnataka' },
    sacCode: '998314',
    gstPercent: 18,
    placeOfSupply: 'Karnataka (29)',
    reverseCharge: false,
    issuedAt: '2026-09-05T00:00:00.000Z',
    lines: [
      { roomType: 'VIDEO_CALL', description: 'Video call sessions', quantityMinutes: 12, taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalPaise: 11800 },
    ],
  };

  it('escapes customer supplied text and includes the mandatory particulars', () => {
    expect(isRenderableSnapshot(snapshot)).toBe(true);
    const html = renderInvoiceHtml(
      {
        invoiceNumber: 'NXR/2627/000007',
        createdAt: new Date('2026-09-05'),
        periodStart: new Date('2026-08-01'),
        periodEnd: new Date('2026-09-01'),
        sacCode: '998314',
        subtotal: 100,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 18,
        totalAmount: 118,
        billingSnapshot: snapshot,
      },
      snapshot as any,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    for (const needle of ['27AAPFU0939F1ZV', 'NXR/2627/000007', '998314', 'Karnataka (29)', 'IGST', 'Unregistered']) {
      expect(html).toContain(needle);
    }
  });

  it('does not treat a legacy invoice without a snapshot as printable', () => {
    expect(isRenderableSnapshot({})).toBe(false);
    expect(isRenderableSnapshot(null)).toBe(false);
  });
});
