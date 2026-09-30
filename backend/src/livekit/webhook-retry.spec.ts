import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { assertPublicWebhookUrl, isPrivateAddress, WebhookUrlError } from './webhook-url.js';
import { MAX_ATTEMPTS, OutboundWebhookService, RETRY_DELAYS_SECONDS } from './outbound-webhook.service.js';

describe('webhook URL guard', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('flags private, loopback, link-local and reserved addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '203.0.113.9', '172.32.0.1', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('accepts a public https address and rejects everything else', async () => {
    await expect(assertPublicWebhookUrl('https://8.8.8.8/hook')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicWebhookUrl('http://8.8.8.8/hook')).rejects.toThrow('https://');
    await expect(assertPublicWebhookUrl('https://127.0.0.1/hook')).rejects.toThrow('public server');
    await expect(assertPublicWebhookUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(WebhookUrlError);
    await expect(assertPublicWebhookUrl('https://user:pass@8.8.8.8/')).rejects.toThrow('username');
    await expect(assertPublicWebhookUrl('not a url')).rejects.toThrow('not valid');
    await expect(assertPublicWebhookUrl('ftp://8.8.8.8/')).rejects.toThrow('https://');
  });

  it('allows local http servers only when explicitly enabled outside production', async () => {
    process.env.WEBHOOK_ALLOW_PRIVATE_URLS = 'true';
    process.env.NODE_ENV = 'development';
    await expect(assertPublicWebhookUrl('http://localhost:9000/hook')).resolves.toBeInstanceOf(URL);
    process.env.NODE_ENV = 'production';
    await expect(assertPublicWebhookUrl('http://localhost:9000/hook')).rejects.toThrow(WebhookUrlError);
  });
});

describe('OutboundWebhookService delivery and retries', () => {
  let prisma: any;
  let notifications: any;
  let service: OutboundWebhookService;
  const NOW = new Date('2026-09-30T10:00:00Z');

  const endpoint = { id: 'ep1', url: 'https://8.8.8.8/hook', signingSecret: 'whsec_test', projectId: 'p1' };
  const row = (over: object = {}) => ({ id: 'd1', eventType: 'room.started', payload: { id: 'evt_1', event: 'room.started', data: { roomName: 'r' } }, attempt: 0, endpoint, ...over });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    prisma = {
      webhookDelivery: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn(),
        create: vi.fn(async ({ data }: any) => ({ id: 'd_new', ...data })),
      },
      webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
      project: { findUnique: vi.fn().mockResolvedValue({ name: 'App', organizationId: 'org_1' }) },
    };
    notifications = { queueOncePerDay: vi.fn() };
    service = new OutboundWebhookService(prisma, notifications);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const respond = (status: number) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status }));

  it('signs the body and records a successful delivery', async () => {
    respond(200);
    const result = await service.attempt(row());
    expect(result).toMatchObject({ succeeded: true, responseCode: 200, attempt: 1, nextRetryAt: null });
    const [, init] = (fetch as any).mock.calls[0];
    expect(init.headers['Nexora-Signature']).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
    expect(init.redirect).toBe('manual');
    expect(prisma.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ attempt: 1, succeeded: true, nextRetryAt: null, lastError: null }),
    });
  });

  it('schedules the retries at 1 minute, 5 minutes, 30 minutes and 2 hours', async () => {
    respond(500);
    for (let attempt = 0; attempt < MAX_ATTEMPTS - 1; attempt++) {
      const result = await service.attempt(row({ attempt }));
      expect(result.succeeded).toBe(false);
      expect(result.nextRetryAt!.getTime()).toBe(NOW.getTime() + RETRY_DELAYS_SECONDS[attempt] * 1000);
    }
    expect(RETRY_DELAYS_SECONDS).toEqual([60, 300, 1800, 7200]);
  });

  it('gives up after the last attempt', async () => {
    respond(503);
    const result = await service.attempt(row({ attempt: MAX_ATTEMPTS - 1 }));
    expect(result).toMatchObject({ succeeded: false, attempt: MAX_ATTEMPTS, nextRetryAt: null });
    expect(prisma.webhookDelivery.update.mock.calls[0][0].data.lastError).toContain('503');
  });

  it('counts a redirect as a failure instead of following it', async () => {
    respond(302);
    const result = await service.attempt(row());
    expect(result.succeeded).toBe(false);
    expect(result.error).toContain('Redirect');
  });

  it('records network errors and never calls a private address', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const failed = await service.attempt(row());
    expect(failed).toMatchObject({ succeeded: false, responseCode: 0, error: 'ECONNRESET' });

    (fetch as any).mockClear();
    const blocked = await service.attempt(row({ endpoint: { ...endpoint, url: 'https://169.254.169.254/latest' } }));
    expect(blocked.succeeded).toBe(false);
    expect(blocked.error).toContain('public server');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tells the customer when the endpoint keeps failing', async () => {
    respond(500);
    prisma.webhookDelivery.findMany.mockResolvedValue(Array(5).fill({ succeeded: false }));
    await service.attempt(row());
    expect(notifications.queueOncePerDay).toHaveBeenCalledWith('org_1', 'WEBHOOK_ENDPOINT_DEGRADED', { url: endpoint.url, projectName: 'App' });
  });

  it('creates one delivery per subscribed endpoint and skips the others', async () => {
    respond(200);
    prisma.webhookEndpoint.findMany.mockResolvedValue([
      { ...endpoint, id: 'a', events: ['*'] },
      { ...endpoint, id: 'b', events: ['room.started'] },
      { ...endpoint, id: 'c', events: ['recording.completed'] },
      { ...endpoint, id: 'd', events: ['room.*'] },
    ]);
    await service.dispatchEvent({ projectId: 'p1', eventType: 'room.started', payload: { roomName: 'r' } });
    expect(prisma.webhookDelivery.create.mock.calls.map((c: any) => c[0].data.endpointId)).toEqual(['a', 'b', 'd']);
    expect(prisma.webhookDelivery.create.mock.calls[0][0].data).toMatchObject({ attempt: 0, succeeded: false, eventType: 'room.started' });
  });

  describe('processRetries', () => {
    const due = (over: object = {}) => ({ ...row({ attempt: 1 }), nextRetryAt: new Date(NOW.getTime() - 1000), ...over });

    it('retries what is due, claiming each row first', async () => {
      respond(200);
      prisma.webhookDelivery.findMany.mockResolvedValue([due()]);
      const handled = await service.processRetries(NOW);
      expect(handled).toBe(1);
      expect(prisma.webhookDelivery.findMany.mock.calls[0][0].where).toMatchObject({ succeeded: false, endpoint: { isActive: true } });
      expect(prisma.webhookDelivery.updateMany).toHaveBeenCalledWith({
        where: { id: 'd1', succeeded: false, nextRetryAt: expect.any(Date) },
        data: { nextRetryAt: null },
      });
      expect(prisma.webhookDelivery.update.mock.calls[0][0].data).toMatchObject({ attempt: 2, succeeded: true });
    });

    it('skips a row another server already claimed', async () => {
      respond(200);
      prisma.webhookDelivery.findMany.mockResolvedValue([due()]);
      prisma.webhookDelivery.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.processRetries(NOW)).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('resend', () => {
    it('resends now and cancels the scheduled retry', async () => {
      respond(200);
      prisma.webhookDelivery.findFirst.mockResolvedValue(row({ attempt: 3 }));
      const result = await service.resend('d1', 'org_1');
      expect(result).toMatchObject({ succeeded: true, attempt: 4 });
      expect(prisma.webhookDelivery.findFirst.mock.calls[0][0].where).toEqual({ id: 'd1', endpoint: { project: { organizationId: 'org_1' } } });
      expect(prisma.webhookDelivery.update.mock.calls[0][0]).toEqual({ where: { id: 'd1' }, data: { nextRetryAt: null } });
    });

    it('refuses a delivery that belongs to another organization', async () => {
      prisma.webhookDelivery.findFirst.mockResolvedValue(null);
      await expect(service.resend('d_other', 'org_1')).rejects.toThrow(NotFoundException);
    });
  });
});
