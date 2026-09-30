import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MAX_AUTO_RECHARGE_FAILURES, PaymentService } from './payment.service.js';
import type { VerifyPaymentDto } from './portal.dto.js';

const TICK_MS = 60 * 1000;
const MIN_AMOUNT = 100;
const MIN_THRESHOLD = 50;
const MAX_THRESHOLD = 100000;
// Do not charge again while an attempt is younger than this.
const ATTEMPT_COOLDOWN_MS = 30 * 60 * 1000;
// A charge with no answer from the bank after this long is treated as failed.
const PENDING_TIMEOUT_MS = 2 * 60 * 60 * 1000;
// Wait a little before asking Razorpay what happened to a charge; the webhook usually arrives first.
const RECONCILE_AFTER_MS = 2 * 60 * 1000;
const TOKEN_LIFETIME_SECONDS = 5 * 365 * 24 * 60 * 60;

export interface AutoRechargeSettings {
  enabled: boolean;
  threshold: number;
  amount: number;
}

export type EvaluateOutcome = 'ok' | 'waiting' | 'notified' | 'waiting_notice' | 'charged' | 'skipped' | 'failed';

/**
 * Automatic wallet recharge from a saved card (Razorpay recurring payments, cards only).
 *
 * How it works: the customer saves a card by paying a first top-up in Razorpay Checkout with the recurring option.
 * When the balance falls below their level we email them, wait AUTO_RECHARGE_NOTICE_HOURS (default 24, as RBI expects a
 * notice before a recurring debit), and if the balance is still low we charge the saved card. The wallet is credited
 * when Razorpay confirms the payment (webhook, or by asking Razorpay if the webhook is late). After
 * MAX_AUTO_RECHARGE_FAILURES failed charges in a row it switches itself off.
 */
@Injectable()
export class AutoRechargeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoRechargeService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.AUTO_RECHARGE_WORKER === 'false') return;
    this.timer = setInterval(() => void this.processDue().catch((e) => this.logger.warn(`Auto recharge run failed: ${e.message}`)), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get maxAmount(): number {
    return Number(process.env.AUTO_RECHARGE_MAX_AMOUNT) || 15000;
  }

  get noticeHours(): number {
    const value = process.env.AUTO_RECHARGE_NOTICE_HOURS;
    if (value === undefined || value === '') return 24;
    const hours = Number(value);
    return Number.isFinite(hours) && hours >= 0 ? hours : 24;
  }

  private async load(organizationId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async getStatus(organizationId: string) {
    const org = await this.load(organizationId);
    return {
      enabled: org.autoRechargeEnabled,
      threshold: org.autoRechargeThreshold === null ? null : Number(org.autoRechargeThreshold),
      amount: org.autoRechargeAmount === null ? null : Number(org.autoRechargeAmount),
      hasPaymentMethod: Boolean(org.razorpayMandateId),
      failures: org.autoRechargeFailures,
      lastError: org.autoRechargeLastError,
      noticeSentAt: org.autoRechargeNoticeAt,
      noticeHours: this.noticeHours,
      maxAmount: this.maxAmount,
      maxFailures: MAX_AUTO_RECHARGE_FAILURES,
    };
  }

  private validate(settings: AutoRechargeSettings) {
    const { threshold, amount } = settings;
    if (!Number.isFinite(threshold) || threshold < MIN_THRESHOLD || threshold > MAX_THRESHOLD) {
      throw new BadRequestException(`The recharge level must be between ₹${MIN_THRESHOLD} and ₹${MAX_THRESHOLD}.`);
    }
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > this.maxAmount) {
      throw new BadRequestException(`The recharge amount must be between ₹${MIN_AMOUNT} and ₹${this.maxAmount}.`);
    }
  }

  /** The on/off switch and the level and amount. Turning it on needs a saved card. */
  async updateSettings(organizationId: string, settings: AutoRechargeSettings) {
    this.validate(settings);
    const org = await this.load(organizationId);
    if (settings.enabled && !org.razorpayMandateId) {
      throw new BadRequestException('Add a payment card first. Auto recharge charges the card you save.');
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        autoRechargeEnabled: settings.enabled,
        autoRechargeThreshold: settings.threshold,
        autoRechargeAmount: settings.amount,
        // A fresh start whenever the customer changes something or turns it on again.
        autoRechargeFailures: 0,
        autoRechargeLastError: null,
        autoRechargeNoticeAt: null,
      },
    });
    return this.getStatus(organizationId);
  }

  private async ownerContact(organizationId: string): Promise<string | null> {
    const owner = await this.prisma.orgMember.findFirst({ where: { organizationId, role: 'OWNER' }, select: { user: { select: { phone: true } } } });
    return owner?.user?.phone ?? null;
  }

  /** Starts saving a card: creates the Razorpay customer and a tokenization order for a first top-up. */
  async startSetup(organizationId: string, amount: number) {
    if (this.payments.usesMockGateway) {
      throw new ServiceUnavailableException('Real Razorpay keys are needed to save a card.');
    }
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT || amount > this.maxAmount) {
      throw new BadRequestException(`The first payment must be between ₹${MIN_AMOUNT} and ₹${this.maxAmount}.`);
    }
    const org = await this.load(organizationId);
    const contact = await this.ownerContact(organizationId);
    if (!contact) {
      throw new BadRequestException('Add your mobile number in Profile first. The bank needs it to authorize the card.');
    }

    let customerId = org.razorpayCustomerId;
    if (!customerId) {
      const customer = await this.payments.razorpay('/customers', {
        method: 'POST',
        body: { name: org.name.slice(0, 50), email: org.billingEmail, contact, fail_existing: '0' },
      });
      customerId = customer.id as string;
      await this.prisma.organization.update({ where: { id: organizationId }, data: { razorpayCustomerId: customerId } });
    }

    const paise = Math.round(amount * 100);
    const order = await this.payments.razorpay('/orders', {
      method: 'POST',
      body: {
        amount: paise,
        currency: 'INR',
        receipt: `ar_setup_${crypto.randomBytes(6).toString('hex')}`,
        customer_id: customerId,
        method: 'card',
        token: {
          max_amount: Math.round(this.maxAmount * 100),
          expire_at: Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS,
          frequency: 'as_presented',
        },
        notes: { organizationId, purpose: 'auto_recharge_setup' },
      },
    });
    await this.prisma.transaction.create({
      data: { organizationId, type: 'WALLET_TOPUP', amount: paise / 100, status: 'PENDING', gatewayOrderId: order.id },
    });
    return { orderId: order.id as string, customerId, keyId: process.env.RAZORPAY_KEY_ID ?? '', amount: paise / 100 };
  }

  /** Finishes saving a card: verifies the first payment (which is credited to the wallet) and keeps the card token. */
  async confirmSetup(organizationId: string, body: VerifyPaymentDto) {
    await this.payments.verifyPayment(organizationId, body);
    const paymentId = body.razorpayPaymentId || body.gatewayPaymentId!;
    const payment = await this.payments.razorpay(`/payments/${paymentId}`);
    const tokenId = payment.token_id as string | undefined;
    if (!tokenId) {
      throw new BadRequestException('The payment worked and your wallet was credited, but the card could not be saved for auto recharge. Try again.');
    }
    await this.prisma.organization.update({ where: { id: organizationId }, data: { razorpayMandateId: tokenId } });
    return this.getStatus(organizationId);
  }

  /** Forgets the saved card and switches auto recharge off. */
  async removeMethod(organizationId: string) {
    const org = await this.load(organizationId);
    if (org.razorpayMandateId && org.razorpayCustomerId && !this.payments.usesMockGateway) {
      // Best effort: even if Razorpay cannot be reached we stop using the token.
      await this.payments
        .razorpay(`/customers/${org.razorpayCustomerId}/tokens/${org.razorpayMandateId}`, { method: 'DELETE' })
        .catch((e) => this.logger.warn(`Could not delete the Razorpay token: ${e.message}`));
    }
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { razorpayMandateId: null, autoRechargeEnabled: false, autoRechargeNoticeAt: null, autoRechargeFailures: 0, autoRechargeLastError: null },
    });
    return this.getStatus(organizationId);
  }

  /** One pass over every organization with auto recharge on. */
  async processDue(now = new Date()): Promise<Record<string, number>> {
    const tally: Record<string, number> = {};
    if (this.running) return tally;
    this.running = true;
    try {
      const orgs = await this.prisma.organization.findMany({
        where: { autoRechargeEnabled: true, razorpayMandateId: { not: null }, autoRechargeThreshold: { not: null }, autoRechargeAmount: { not: null } },
        take: 500,
      });
      for (const org of orgs) {
        try {
          const outcome = await this.evaluate(org, now);
          tally[outcome] = (tally[outcome] ?? 0) + 1;
        } catch (err) {
          this.logger.warn(`Auto recharge for ${org.id} failed: ${(err as Error).message}`);
          tally.error = (tally.error ?? 0) + 1;
        }
      }
    } finally {
      this.running = false;
    }
    return tally;
  }

  async evaluate(org: Awaited<ReturnType<AutoRechargeService['load']>>, now = new Date()): Promise<EvaluateOutcome> {
    if (this.payments.usesMockGateway) return 'skipped';

    const pending = await this.prisma.transaction.findFirst({ where: { organizationId: org.id, type: 'AUTO_RECHARGE', status: 'PENDING' } });
    if (pending) return this.reconcile(org, pending, now);

    const balance = Number(org.walletBalance);
    const threshold = Number(org.autoRechargeThreshold);
    const amount = Number(org.autoRechargeAmount);

    if (balance >= threshold) {
      if (org.autoRechargeNoticeAt) {
        await this.prisma.organization.updateMany({ where: { id: org.id, autoRechargeNoticeAt: { not: null } }, data: { autoRechargeNoticeAt: null } });
      }
      return 'ok';
    }
    if (org.autoRechargeFailures >= MAX_AUTO_RECHARGE_FAILURES) return 'skipped';

    // The customer hears about the charge first, and we wait before making it.
    const waitMs = this.noticeHours * 60 * 60 * 1000;
    if (waitMs > 0) {
      if (!org.autoRechargeNoticeAt) {
        const claim = await this.prisma.organization.updateMany({ where: { id: org.id, autoRechargeNoticeAt: null }, data: { autoRechargeNoticeAt: now } });
        if (claim.count === 0) return 'waiting_notice';
        const chargeOn = new Date(now.getTime() + waitMs).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
        await this.notifications?.queue(org.id, 'AUTO_RECHARGE_NOTICE', { balance, threshold, amount, chargeOn: `${chargeOn} IST` });
        return 'notified';
      }
      if (now.getTime() < org.autoRechargeNoticeAt.getTime() + waitMs) return 'waiting_notice';
    }

    // Claim the attempt so two servers never charge the same card at the same time.
    const claim = await this.prisma.organization.updateMany({
      where: {
        id: org.id,
        autoRechargeEnabled: true,
        OR: [{ autoRechargeLastAttemptAt: null }, { autoRechargeLastAttemptAt: { lt: new Date(now.getTime() - ATTEMPT_COOLDOWN_MS) } }],
      },
      data: { autoRechargeLastAttemptAt: now },
    });
    if (claim.count === 0) return 'waiting';
    return this.charge(org, amount);
  }

  private async charge(org: Awaited<ReturnType<AutoRechargeService['load']>>, amount: number): Promise<EvaluateOutcome> {
    const contact = await this.ownerContact(org.id);
    let orderId: string | undefined;
    try {
      if (!contact || !org.razorpayCustomerId || !org.razorpayMandateId) {
        throw new Error('The saved card or the owner phone number is missing.');
      }
      const paise = Math.round(amount * 100);
      const order = await this.payments.razorpay('/orders', {
        method: 'POST',
        body: { amount: paise, currency: 'INR', receipt: `ar_${crypto.randomBytes(6).toString('hex')}`, payment_capture: true, notes: { organizationId: org.id, purpose: 'auto_recharge' } },
      });
      orderId = order.id as string;
      await this.prisma.transaction.create({
        data: { organizationId: org.id, type: 'AUTO_RECHARGE', amount: paise / 100, status: 'PENDING', gatewayOrderId: orderId },
      });
      await this.payments.razorpay('/payments/create/recurring', {
        method: 'POST',
        body: {
          email: org.billingEmail,
          contact,
          amount: paise,
          currency: 'INR',
          order_id: orderId,
          customer_id: org.razorpayCustomerId,
          token: org.razorpayMandateId,
          recurring: '1',
          description: 'Wallet auto recharge',
          notes: { organizationId: org.id },
        },
      });
      // The wallet is credited when Razorpay confirms the payment (webhook, or reconcile() below).
      return 'charged';
    } catch (err) {
      const reason = (err as Error).message || 'The charge could not be made';
      if (orderId) {
        await this.prisma.transaction.updateMany({ where: { gatewayOrderId: orderId, status: 'PENDING' }, data: { status: 'FAILED' } });
      }
      await this.payments.recordAutoRechargeFailure(org.id, reason);
      return 'failed';
    }
  }

  /** Works out what happened to a charge we are waiting on, in case the webhook never arrived. */
  private async reconcile(org: { id: string }, pending: { id: string; gatewayOrderId: string | null; amount: unknown; createdAt: Date }, now: Date): Promise<EvaluateOutcome> {
    const age = now.getTime() - pending.createdAt.getTime();
    if (age < RECONCILE_AFTER_MS || !pending.gatewayOrderId) return 'waiting';

    let items: { id: string; status: string; error_description?: string }[] = [];
    try {
      items = (await this.payments.razorpay(`/orders/${pending.gatewayOrderId}/payments`)).items ?? [];
    } catch (err) {
      this.logger.warn(`Could not check order ${pending.gatewayOrderId}: ${(err as Error).message}`);
    }

    const captured = items.find((p) => p.status === 'captured');
    if (captured) {
      await this.payments.creditCapturedPayment({
        organizationId: org.id,
        orderId: pending.gatewayOrderId,
        paymentId: captured.id,
        amountRupees: Number(pending.amount),
        pendingId: pending.id,
      });
      return 'ok';
    }
    const failed = items.length > 0 && items.every((p) => p.status === 'failed');
    if (failed || age > PENDING_TIMEOUT_MS) {
      const reason = failed ? items[0].error_description || 'The bank declined the charge' : 'The bank did not confirm the charge in time';
      const marked = await this.prisma.transaction.updateMany({ where: { id: pending.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      if (marked.count > 0) await this.payments.recordAutoRechargeFailure(org.id, reason);
      return 'failed';
    }
    return 'waiting';
  }
}
