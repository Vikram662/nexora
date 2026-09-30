import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationsService } from './notifications.service.js';
import { SmsService } from './sms.service.js';
import { buildEmail, smsVariables } from './notification-templates.js';
import { OutboundWebhookService } from '../livekit/outbound-webhook.service.js';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { RoomsService } from '../livekit/rooms.service.js';

const ctx = { siteName: 'Nexora', organizationName: 'Acme', appUrl: 'https://app.example.com' };

describe('new email and SMS templates', () => {
  it('builds webhook, security and room limit emails', () => {
    expect(buildEmail('WEBHOOK_ENDPOINT_DEGRADED', { url: 'https://x.example/hook', projectName: 'App' }, ctx)!.subject).toBe('Webhook endpoint failing for App');
    const sec = buildEmail('SECURITY_ALERT', { projectName: 'App', apiKeyPrefix: 'pk_test_1', attempts: 10, ip: '1.2.3.4', lockMinutes: 5 }, ctx)!;
    expect(sec.text).toContain('10 failed API authentication attempts');
    expect(sec.text).toContain('1.2.3.4');
    expect(buildEmail('PLAN_LIMIT_REACHED', { projectName: 'App', limit: 10 }, ctx)!.text).toContain('more than 10 rooms');
  });

  it('builds short SMS template variables only for types that have an SMS template', () => {
    expect(smsVariables('LOW_BALANCE', { balance: 42 })).toEqual({ balance: '42.00' });
    const long = smsVariables('API_KEY_ROTATED', { projectName: 'A very long project name that goes past thirty characters' })!;
    expect(long.project).toHaveLength(30);
    expect('A very long project name that goes past thirty characters'.startsWith(long.project)).toBe(true);
    expect(smsVariables('KYC_APPROVED', {})).toEqual({});
    expect(smsVariables('INVOICE_GENERATED', {})).toBeNull();
  });
});

describe('SmsService (MSG91)', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const configure = () => {
    process.env.SMS_PROVIDER = 'MSG91';
    process.env.SMS_API_KEY = 'authkey123';
    process.env.MSG91_TEMPLATE_LOW_BALANCE = 'tpl_low';
  };

  it('is off until the provider and key are set', () => {
    delete process.env.SMS_PROVIDER;
    expect(new SmsService().isConfigured()).toBe(false);
    configure();
    expect(new SmsService().isConfigured()).toBe(true);
  });

  it('supports only the types that have a template id', () => {
    configure();
    const sms = new SmsService();
    expect(sms.supports('LOW_BALANCE')).toBe(true);
    expect(sms.supports('PAYMENT_RECEIVED')).toBe(false);
  });

  it('posts the template and variables to the MSG91 flow API without the plus sign', async () => {
    configure();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ type: 'success', message: 'req_1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new SmsService().send({ to: '+919999999999', type: 'LOW_BALANCE', variables: { balance: '42.00' } });
    expect(result.messageId).toBe('req_1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://control.msg91.com/api/v5/flow');
    expect(init.headers.authkey).toBe('authkey123');
    expect(JSON.parse(init.body)).toEqual({ template_id: 'tpl_low', short_url: '0', recipients: [{ mobiles: '919999999999', balance: '42.00' }] });
  });

  it('treats a 200 response with type error as a failure', async () => {
    configure();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ type: 'error', message: 'Template not approved' }) }));
    await expect(new SmsService().send({ to: '+919999999999', type: 'LOW_BALANCE', variables: {} })).rejects.toThrow('Template not approved');
  });

  it('refuses to send a type that has no template id', async () => {
    configure();
    await expect(new SmsService().send({ to: '+919999999999', type: 'PAYMENT_RECEIVED', variables: {} })).rejects.toThrow('MSG91_TEMPLATE_PAYMENT_RECEIVED');
  });
});

describe('NotificationsService SMS and daily limits', () => {
  let prisma: any;
  let mailer: any;
  let sms: any;
  let service: NotificationsService;

  const orgWith = (pref: object | null) => ({ billingEmail: 'billing@acme.com', notificationPreference: pref });
  const channels = () => prisma.notificationLog.create.mock.calls.map((c: any) => c[0].data.channel);

  beforeEach(() => {
    prisma = {
      organization: { findUnique: vi.fn().mockResolvedValue(orgWith(null)) },
      orgMember: { findFirst: vi.fn().mockResolvedValue({ user: { phone: '+919999999999' } }) },
      notificationLog: {
        create: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    mailer = { isConfigured: vi.fn().mockReturnValue(false), send: vi.fn() };
    sms = { isConfigured: vi.fn().mockReturnValue(true), supports: vi.fn().mockReturnValue(true), send: vi.fn().mockResolvedValue({ messageId: 'SM1' }) };
    const settings: any = { getSnapshot: vi.fn().mockResolvedValue({ brand: { siteName: 'Nexora' } }) };
    service = new NotificationsService(prisma, settings, mailer, sms);
  });

  it('adds an SMS for the owner only when they opted in', async () => {
    await service.queue('org_1', 'LOW_BALANCE', { balance: 10 });
    expect(channels()).toEqual(['EMAIL']);

    prisma.notificationLog.create.mockClear();
    prisma.organization.findUnique.mockResolvedValue(orgWith({ emailEnabled: true, smsEnabled: true, criticalOnlyViaSms: true }));
    await service.queue('org_1', 'LOW_BALANCE', { balance: 10 });
    expect(channels()).toEqual(['EMAIL', 'SMS']);
    expect(prisma.notificationLog.create.mock.calls[1][0].data.destination).toBe('+919999999999');
  });

  it('keeps non-critical types off SMS when the org wants critical alerts only', async () => {
    prisma.organization.findUnique.mockResolvedValue(orgWith({ emailEnabled: true, smsEnabled: true, criticalOnlyViaSms: true }));
    await service.queue('org_1', 'PAYMENT_RECEIVED', { amount: 5 });
    expect(channels()).toEqual(['EMAIL']);

    prisma.notificationLog.create.mockClear();
    prisma.organization.findUnique.mockResolvedValue(orgWith({ emailEnabled: true, smsEnabled: true, criticalOnlyViaSms: false }));
    await service.queue('org_1', 'PAYMENT_RECEIVED', { amount: 5 });
    expect(channels()).toEqual(['EMAIL', 'SMS']);
  });

  it('sends only SMS when email is off but SMS is on, and skips owners without a phone', async () => {
    prisma.organization.findUnique.mockResolvedValue(orgWith({ emailEnabled: false, smsEnabled: true, criticalOnlyViaSms: true }));
    await service.queue('org_1', 'SECURITY_ALERT', {});
    expect(channels()).toEqual(['SMS']);

    prisma.notificationLog.create.mockClear();
    prisma.orgMember.findFirst.mockResolvedValue({ user: { phone: null } });
    await service.queue('org_1', 'SECURITY_ALERT', {});
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('does not queue an SMS for a type that has no MSG91 template', async () => {
    sms.supports.mockReturnValue(false);
    prisma.organization.findUnique.mockResolvedValue(orgWith({ emailEnabled: true, smsEnabled: true, criticalOnlyViaSms: false }));
    await service.queue('org_1', 'PAYMENT_RECEIVED', { amount: 5 });
    expect(channels()).toEqual(['EMAIL']);
  });

  it('queueOncePerDay skips a type the organization already got in the last 24 hours', async () => {
    prisma.notificationLog.findFirst.mockResolvedValue({ id: 'recent' });
    await service.queueOncePerDay('org_1', 'PLAN_LIMIT_REACHED', { projectName: 'App', limit: 10 });
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();

    prisma.notificationLog.findFirst.mockResolvedValue(null);
    await service.queueOncePerDay('org_1', 'PLAN_LIMIT_REACHED', { projectName: 'App', limit: 10 });
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it('sends queued SMS through the SMS provider even when email is not configured', async () => {
    prisma.notificationLog.findMany.mockResolvedValue([
      { id: 'n1', type: 'LOW_BALANCE', channel: 'SMS', organizationId: 'org_1', destination: '+919999999999', payload: { balance: 10 }, attempts: 0 },
    ]);
    prisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    const result = await service.processQueue();
    expect(result.sent).toBe(1);
    expect(sms.send).toHaveBeenCalledWith({ to: '+919999999999', type: 'LOW_BALANCE', variables: { balance: '10.00' } });
    expect(prisma.notificationLog.findMany.mock.calls[0][0].where.channel).toEqual({ in: ['SMS'] });
  });

  it('does nothing when neither email nor SMS is configured', async () => {
    sms.isConfigured.mockReturnValue(false);
    const result = await service.processQueue();
    expect(result.skipped).toBe('not_configured');
  });
});

describe('alert triggers', () => {
  it('tells the customer when the last 5 webhook deliveries all failed', async () => {
    const notifications = { queueOncePerDay: vi.fn() };
    const prisma: any = {
      webhookDelivery: { findMany: vi.fn().mockResolvedValue(Array(5).fill({ succeeded: false })) },
      project: { findUnique: vi.fn().mockResolvedValue({ name: 'App', organizationId: 'org_1' }) },
    };
    const service = new OutboundWebhookService(prisma, notifications as any);
    await service.checkDegraded({ id: 'ep1', url: 'https://x.example/hook', projectId: 'p1' });
    expect(notifications.queueOncePerDay).toHaveBeenCalledWith('org_1', 'WEBHOOK_ENDPOINT_DEGRADED', { url: 'https://x.example/hook', projectName: 'App' });

    notifications.queueOncePerDay.mockClear();
    prisma.webhookDelivery.findMany.mockResolvedValue([{ succeeded: false }, { succeeded: true }, ...Array(3).fill({ succeeded: false })]);
    await service.checkDegraded({ id: 'ep1', url: 'u', projectId: 'p1' });
    prisma.webhookDelivery.findMany.mockResolvedValue(Array(3).fill({ succeeded: false }));
    await service.checkDegraded({ id: 'ep1', url: 'u', projectId: 'p1' });
    expect(notifications.queueOncePerDay).not.toHaveBeenCalled();
  });

  it('raises a security alert when repeated bad secrets lock a key', async () => {
    const notifications = { queueOncePerDay: vi.fn().mockResolvedValue(undefined) };
    const project = { id: 'p1', organizationId: 'org_1', name: 'App', isSuspended: false, environment: 'SANDBOX', apiSecretHash: 'h', organization: { walletBalance: 0 } };
    const prisma: any = { project: { findUnique: vi.fn().mockResolvedValue(project) } };
    const crypto: any = { verifyApiSecret: vi.fn().mockResolvedValue(false) };
    const guard = new ApiKeyGuard(prisma, crypto, notifications as any);
    const ctxFor = () =>
      ({ switchToHttp: () => ({ getRequest: () => ({ ip: '9.9.9.9', headers: { 'x-api-key': 'pk_test_alert', 'x-api-secret': 'bad' } }) }) }) as any;
    for (let i = 0; i < 10; i++) await guard.canActivate(ctxFor()).catch(() => undefined);
    expect(notifications.queueOncePerDay).toHaveBeenCalledTimes(1);
    expect(notifications.queueOncePerDay).toHaveBeenCalledWith(
      'org_1',
      'SECURITY_ALERT',
      expect.objectContaining({ projectName: 'App', ip: '9.9.9.9', attempts: 10, lockMinutes: 5 }),
    );
  });

  it('notifies when a project hits its room limit', async () => {
    const notifications = { queueOncePerDay: vi.fn() };
    const prisma: any = { project: { findUnique: vi.fn().mockResolvedValue({ maxConcurrentRooms: 1, name: 'App', organizationId: 'org_1' }) } };
    const config: any = { get: (k: string) => ({ LIVEKIT_URL: 'http://127.0.0.1:7880', LIVEKIT_API_KEY: 'k', LIVEKIT_API_SECRET: 's'.repeat(32) })[k] };
    const rooms = new RoomsService(config, prisma, notifications as any);
    (rooms as any).roomService = { listRooms: vi.fn().mockResolvedValue([{ name: 'p1__existing' }]) };
    await expect(rooms.createRoom({ projectId: 'p1', roomName: 'another' } as any)).rejects.toThrow(/room limit reached/i);
    expect(notifications.queueOncePerDay).toHaveBeenCalledWith('org_1', 'PLAN_LIMIT_REACHED', { projectName: 'App', limit: 1 });
  });
});
