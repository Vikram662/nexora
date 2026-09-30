import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';

// Sessions are billed per started minute, so a session is never billed for less than this.
const MIN_BILLABLE_SECONDS = 60;
const LOW_BALANCE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Queues at most one LOW_BALANCE email per organisation per 24 hours. Never throws. */
  async checkLowBalance(organizationId: string): Promise<void> {
    try {
      const threshold = Number(this.config.get('LOW_BALANCE_THRESHOLD') ?? 100);
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { walletBalance: true, billingEmail: true, notificationPreference: true },
      });
      if (!org || Number(org.walletBalance) >= threshold) return;
      if (org.notificationPreference && !org.notificationPreference.emailEnabled) return;

      const recent = await this.prisma.notificationLog.findFirst({
        where: {
          organizationId,
          type: 'LOW_BALANCE',
          createdAt: { gte: new Date(Date.now() - LOW_BALANCE_COOLDOWN_MS) },
        },
        select: { id: true },
      });
      if (recent) return;

      await this.prisma.notificationLog.create({
        data: {
          organizationId,
          type: 'LOW_BALANCE',
          channel: 'EMAIL',
          destination: org.billingEmail,
          status: 'QUEUED',
          payload: { balance: Number(org.walletBalance), threshold },
        },
      });
    } catch (err) {
      this.logger.warn(`Low balance check failed for ${organizationId}: ${(err as Error).message}`);
    }
  }

  /** Marks the first real join as the start of the billable window (tokens can be minted long before use). */
  async markSessionStarted(projectId: string, roomName: string, identity: string, joinedAt = new Date()) {
    await this.prisma.usageLog.updateMany({
      where: { projectId, roomName, participantIdentity: identity, endedAt: null },
      data: { startedAt: joinedAt },
    });
  }

  /**
   * Reconciles the upfront block charged at token mint with the real session length:
   * unused time is refunded, and overage is charged if the wallet can cover it.
   */
  async settleSession(projectId: string, roomName: string, identity: string, leftAt = new Date()): Promise<void> {
    const log = await this.prisma.usageLog.findFirst({
      where: { projectId, roomName, participantIdentity: identity, endedAt: null, invoiceId: null },
      orderBy: { startedAt: 'desc' },
      include: { project: { select: { organizationId: true } } },
    });
    if (!log || log.billableSeconds == null || log.amountDeducted == null) return;

    const rate = Number(log.ratePerMinute);
    const prepaid = log.billableSeconds;
    const actual = Math.max(MIN_BILLABLE_SECONDS, Math.ceil((leftAt.getTime() - log.startedAt.getTime()) / 1000));
    const orgId = log.project.organizationId;
    let billed = Math.min(actual, prepaid);

    if (actual < prepaid) {
      const refund = Number((((prepaid - actual) / 60) * rate).toFixed(4));
      await this.prisma.organization.update({ where: { id: orgId }, data: { walletBalance: { increment: refund } } });
    } else if (actual > prepaid) {
      const overage = Number((((actual - prepaid) / 60) * rate).toFixed(4));
      const charged = await this.prisma.organization.updateMany({
        where: { id: orgId, walletBalance: { gte: overage } },
        data: { walletBalance: { decrement: overage } },
      });
      if (charged.count > 0) billed = actual;
      else this.logger.warn(`Unbilled overage of ${overage} for usage log ${log.id}: wallet too low`);
    }

    await this.prisma.usageLog.update({
      where: { id: log.id },
      data: {
        endedAt: leftAt,
        billableSeconds: billed,
        amountDeducted: Number(((billed / 60) * rate).toFixed(4)),
      },
    });
    await this.checkLowBalance(orgId);
  }
}
