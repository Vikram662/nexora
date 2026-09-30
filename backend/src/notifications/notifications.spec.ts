import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { MailerService } from './mailer.service.js';
import { buildEmail } from './notification-templates.js';

const ctx = { siteName: 'Nexora', organizationName: 'Acme <Inc>', appUrl: 'https://app.example.com/' };

describe('email templates', () => {
  it('builds a low balance email with an escaped org name and a link', () => {
    const email = buildEmail('LOW_BALANCE', { balance: 42.5 }, ctx)!;
    expect(email.subject).toBe('Your wallet balance is low');
    expect(email.html).toContain('Acme &lt;Inc&gt;');
    expect(email.html).toContain('https://app.example.com/user/billing');
    expect(email.text).toContain('₹42.50');
  });

  it('attaches the invoice to the invoice email', () => {
    const email = buildEmail('INVOICE_GENERATED', { invoiceNumber: 'NXR/2627/000001', period: '2026-08-01 to 2026-08-31', total: 118 }, ctx, {
      filename: 'NXR-2627-000001.pdf',
      content: Buffer.from('%PDF-1.3'),
      contentType: 'application/pdf',
    })!;
    expect(email.subject).toContain('NXR/2627/000001');
    expect(email.attachments).toEqual([{ filename: 'NXR-2627-000001.pdf', content: Buffer.from('%PDF-1.3'), contentType: 'application/pdf' }]);
  });

  it('builds welcome and API key rotation emails', () => {
    const welcome = buildEmail('WELCOME', {}, ctx)!;
    expect(welcome.subject).toBe('Welcome to Nexora');
    const rotated = buildEmail('API_KEY_ROTATED', { projectName: 'Video <App>', ip: '203.0.113.9', graceWindowExpiresAt: '2026-10-02T00:00:00.000Z' }, ctx)!;
    expect(rotated.subject).toBe('API secret rotated for Video <App>');
    expect(rotated.html).toContain('Video &lt;App&gt;');
    expect(rotated.text).toContain('203.0.113.9');
    expect(rotated.text).toContain('2026-10-02');
  });

  it('has no template for types that are not emailed', () => {
    expect(buildEmail('AUTO_RECHARGE_FAILED', {}, ctx)).toBeNull();
  });
});

describe('NotificationsService', () => {
  let prisma: any;
  let mailer: any;
  let sms: any;
  let service: NotificationsService;
  const queued = (over: object = {}) => ({
    id: 'n1',
    type: 'LOW_BALANCE',
    organizationId: 'org_1',
    destination: 'a@b.c',
    payload: { balance: 10 },
    attempts: 0,
    ...over,
  });

  beforeEach(() => {
    prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue({ name: 'Acme', billingEmail: 'billing@acme.com', notificationPreference: null }),
      },
      notificationLog: {
        create: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([queued()]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
      invoice: { findUnique: vi.fn() },
      creditNote: { findUnique: vi.fn() },
    };
    mailer = { isConfigured: vi.fn().mockReturnValue(true), send: vi.fn().mockResolvedValue({ messageId: 'm1' }) };
    const settings: any = { getSnapshot: vi.fn().mockResolvedValue({ brand: { siteName: 'Nexora' } }) };
    sms = { isConfigured: vi.fn().mockReturnValue(false), supports: vi.fn().mockReturnValue(false), send: vi.fn().mockResolvedValue({ messageId: 'sms1' }) };
    service = new NotificationsService(prisma, settings, mailer as MailerService, sms);
  });

  describe('queue', () => {
    it('queues to the billing email by default, or to an override', async () => {
      await service.queue('org_1', 'PAYMENT_RECEIVED', { amount: 5 });
      expect(prisma.notificationLog.create).toHaveBeenLastCalledWith({
        data: { organizationId: 'org_1', type: 'PAYMENT_RECEIVED', channel: 'EMAIL', destination: 'billing@acme.com', status: 'QUEUED', payload: { amount: 5 } },
      });
      await service.queue('org_1', 'INVOICE_GENERATED', {}, 'finance@acme.com');
      expect(prisma.notificationLog.create.mock.calls[1][0].data.destination).toBe('finance@acme.com');
    });

    it('respects an organization that turned email off', async () => {
      prisma.organization.findUnique.mockResolvedValue({ billingEmail: 'x@y.z', notificationPreference: { emailEnabled: false } });
      await service.queue('org_1', 'LOW_BALANCE');
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('never throws, so it cannot break the action that triggered it', async () => {
      prisma.notificationLog.create.mockRejectedValue(new Error('db down'));
      await expect(service.queue('org_1', 'LOW_BALANCE')).resolves.toBeUndefined();
    });
  });

  describe('processQueue', () => {
    it('sends a queued email and marks it sent', async () => {
      const result = await service.processQueue();
      expect(result).toMatchObject({ sent: 1, failed: 0 });
      expect(mailer.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.c', subject: 'Your wallet balance is low' }));
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: expect.objectContaining({ status: 'SENT', providerRef: 'm1' }),
      });
    });

    it('leaves emails queued when SMTP is not configured', async () => {
      mailer.isConfigured.mockReturnValue(false);
      const result = await service.processQueue();
      expect(result.skipped).toBe('not_configured');
      expect(prisma.notificationLog.findMany).not.toHaveBeenCalled();
    });

    it('keeps a failed email queued for a retry, then gives up after 3 attempts', async () => {
      mailer.send.mockRejectedValue(new Error('smtp down'));
      let result = await service.processQueue();
      expect(result.retrying).toBe(1);
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({ where: { id: 'n1' }, data: { status: 'QUEUED', errorReason: 'smtp down' } });

      prisma.notificationLog.findMany.mockResolvedValue([queued({ attempts: 2 })]);
      result = await service.processQueue();
      expect(result.failed).toBe(1);
      expect(prisma.notificationLog.update).toHaveBeenLastCalledWith({ where: { id: 'n1' }, data: { status: 'FAILED', errorReason: 'smtp down' } });
    });

    it('skips a row another instance already claimed', async () => {
      prisma.notificationLog.updateMany.mockResolvedValue({ count: 0 });
      const result = await service.processQueue();
      expect(result.sent).toBe(0);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('marks types without a template as failed instead of retrying forever', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([queued({ type: 'AUTO_RECHARGE_FAILED' })]);
      const result = await service.processQueue();
      expect(result.failed).toBe(1);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('attaches the invoice as a PDF to the invoice email', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([queued({ type: 'INVOICE_GENERATED', payload: { invoiceId: 'inv_1' } })]);
      prisma.invoice.findUnique.mockResolvedValue({
        invoiceNumber: 'NXR/2627/000001',
        totalAmount: 118,
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
        createdAt: new Date('2026-09-05T00:00:00Z'),
        subtotal: 100,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 18,
        sacCode: '998314',
        billingSnapshot: {
          supplier: { legalName: 'Acme', gstin: '27AAPFU0939F1ZV', address: 'Mumbai', stateCode: '27', stateName: 'Maharashtra' },
          recipient: { legalName: 'Buyer', gstin: null, addressLines: ['x'], stateCode: '29', stateName: 'Karnataka' },
          sacCode: '998314',
          gstPercent: 18,
          placeOfSupply: 'Karnataka (29)',
          reverseCharge: false,
          issuedAt: '2026-09-05T00:00:00.000Z',
          lines: [{ roomType: 'VIDEO_CALL', description: 'Video call sessions', quantityMinutes: 10, taxablePaise: 10000, cgstPaise: 0, sgstPaise: 0, igstPaise: 1800, totalPaise: 11800 }],
        },
      });
      await service.processQueue();
      const sent = mailer.send.mock.calls[0][0];
      expect(sent.attachments[0].filename).toBe('NXR-2627-000001.pdf');
      expect(sent.attachments[0].contentType).toBe('application/pdf');
      expect(Buffer.from(sent.attachments[0].content).subarray(0, 5).toString()).toBe('%PDF-');
    });
  });
});
