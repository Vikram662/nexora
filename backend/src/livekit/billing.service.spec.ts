import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService } from './billing.service.js';

const START = new Date('2026-01-01T10:00:00Z');
const at = (seconds: number) => new Date(START.getTime() + seconds * 1000);

describe('BillingService', () => {
  let prisma: any;
  let service: BillingService;

  beforeEach(() => {
    prisma = {
      usageLog: {
        findFirst: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      organization: {
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({ walletBalance: 1000, billingEmail: 'a@b.c', notificationPreference: null }),
      },
      notificationLog: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
    };
    service = new BillingService(prisma, { get: () => undefined } as any);
  });

  const openLog = (billableSeconds = 600) => ({
    id: 'log_1',
    startedAt: START,
    billableSeconds,
    amountDeducted: (billableSeconds / 60) * 2,
    ratePerMinute: 2,
    project: { organizationId: 'org_1' },
  });

  it('refunds unused prepaid time when the participant leaves early', async () => {
    prisma.usageLog.findFirst.mockResolvedValue(openLog());
    await service.settleSession('p', 'room', 'alice', at(180));
    // 600s prepaid, 180s used -> 420s refunded at 2/min
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { walletBalance: { increment: 14 } },
    });
    expect(prisma.usageLog.update).toHaveBeenCalledWith({
      where: { id: 'log_1' },
      data: { endedAt: at(180), billableSeconds: 180, amountDeducted: 6 },
    });
  });

  it('never bills less than one minute', async () => {
    prisma.usageLog.findFirst.mockResolvedValue(openLog());
    await service.settleSession('p', 'room', 'alice', at(5));
    expect(prisma.usageLog.update.mock.calls[0][0].data.billableSeconds).toBe(60);
  });

  it('charges overage when the session outlasts the prepaid block', async () => {
    prisma.usageLog.findFirst.mockResolvedValue(openLog());
    await service.settleSession('p', 'room', 'alice', at(720));
    expect(prisma.organization.updateMany).toHaveBeenCalledWith({
      where: { id: 'org_1', walletBalance: { gte: 4 } },
      data: { walletBalance: { decrement: 4 } },
    });
    expect(prisma.usageLog.update.mock.calls[0][0].data.billableSeconds).toBe(720);
  });

  it('keeps the prepaid amount if the wallet cannot cover overage', async () => {
    prisma.usageLog.findFirst.mockResolvedValue(openLog());
    prisma.organization.updateMany.mockResolvedValue({ count: 0 });
    await service.settleSession('p', 'room', 'alice', at(720));
    expect(prisma.usageLog.update.mock.calls[0][0].data.billableSeconds).toBe(600);
  });

  it('ignores participants that have no open billable session', async () => {
    prisma.usageLog.findFirst.mockResolvedValue(null);
    await service.settleSession('p', 'room', 'ghost');
    expect(prisma.usageLog.update).not.toHaveBeenCalled();
    expect(prisma.organization.update).not.toHaveBeenCalled();
  });

  describe('checkLowBalance', () => {
    it('queues one email when the balance is below the threshold', async () => {
      prisma.organization.findUnique.mockResolvedValue({ walletBalance: 20, billingEmail: 'a@b.c', notificationPreference: null });
      await service.checkLowBalance('org_1');
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: { organizationId: 'org_1', type: 'LOW_BALANCE', channel: 'EMAIL', destination: 'a@b.c', status: 'QUEUED' },
      });
    });

    it('does nothing when the balance is healthy, recently alerted, or email is disabled', async () => {
      await service.checkLowBalance('org_1');
      prisma.organization.findUnique.mockResolvedValue({ walletBalance: 20, billingEmail: 'a@b.c', notificationPreference: null });
      prisma.notificationLog.findFirst.mockResolvedValue({ id: 'n1' });
      await service.checkLowBalance('org_1');
      prisma.notificationLog.findFirst.mockResolvedValue(null);
      prisma.organization.findUnique.mockResolvedValue({ walletBalance: 20, billingEmail: 'a@b.c', notificationPreference: { emailEnabled: false } });
      await service.checkLowBalance('org_1');
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });
  });
});
