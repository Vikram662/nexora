import { Injectable, BadRequestException, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { VerifyPaymentDto } from './portal.dto.js';
import { NotificationsService } from '../notifications/notifications.service.js';

interface SettleInput {
  organizationId: string;
  orderId?: string;
  paymentId: string;
  amountRupees: number;
  webhookVerified: boolean;
  /** The PENDING wallet top-up created with the order, if there is one. */
  pendingId?: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private get razorpaySecret(): string {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new BadRequestException('Payment gateway secret not configured on server');
    }
    return secret;
  }

  private get webhookSecret(): string {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Razorpay webhook secret not configured on server');
    }
    return secret;
  }

  /** Placeholder keys (rzp_test_mock...) skip calls to Razorpay so local development and tests work offline. */
  private get usesMockGateway(): boolean {
    const mock = Boolean(process.env.RAZORPAY_KEY_ID?.startsWith('rzp_test_mock'));
    if (mock && process.env.NODE_ENV === 'production') {
      throw new ServiceUnavailableException('The payment gateway is configured with placeholder keys. Set real Razorpay keys.');
    }
    return mock;
  }

  private async razorpay(path: string, init?: { method?: string; body?: unknown }): Promise<any> {
    const auth = 'Basic ' + Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${this.razorpaySecret}`).toString('base64');
    let res: Response;
    try {
      res = await fetch(`https://api.razorpay.com/v1${path}`, {
        method: init?.method ?? 'GET',
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: init?.body ? JSON.stringify(init.body) : undefined,
      });
    } catch (err: any) {
      this.logger.warn(`Razorpay request failed: ${err.message}`);
      throw new ServiceUnavailableException('Could not reach the payment gateway. Try again in a moment.');
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Razorpay ${path} returned ${res.status}: ${json?.error?.description ?? 'no detail'}`);
      throw new BadRequestException(json?.error?.description || 'The payment gateway rejected the request.');
    }
    return json;
  }

  /** Creates a real Razorpay order and records a PENDING top-up, so the amount credited later comes from us, never the browser. */
  async createOrder(organizationId: string, amount: number) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      throw new BadRequestException('RAZORPAY_KEY_ID not configured on server');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('The amount must be more than zero.');
    }
    const paise = Math.round(amount * 100);

    let orderId: string;
    if (this.usesMockGateway) {
      orderId = `order_mock_${crypto.randomBytes(8).toString('hex')}`;
    } else {
      const order = await this.razorpay('/orders', {
        method: 'POST',
        body: { amount: paise, currency: 'INR', receipt: `wallet_${crypto.randomBytes(6).toString('hex')}`, notes: { organizationId } },
      });
      orderId = order.id;
    }

    await this.prisma.transaction.create({
      data: { organizationId, type: 'WALLET_TOPUP', amount: paise / 100, status: 'PENDING', gatewayOrderId: orderId },
    });

    return { orderId, amount: paise / 100, currency: 'INR', keyId };
  }

  /**
   * Adds a captured payment to the wallet exactly once. The PENDING row is claimed with a conditional update,
   * and the unique payment id rejects duplicates, so concurrent verify calls and webhooks cannot double-credit.
   */
  private async settleTopup(input: SettleInput): Promise<{ newBalance: unknown; transactionId: string } | null> {
    try {
      const out = await this.prisma.$transaction(async (tx) => {
        let transactionId: string;
        if (input.pendingId) {
          const claim = await tx.transaction.updateMany({
            where: { id: input.pendingId, status: { not: 'SUCCESS' } },
            data: { status: 'SUCCESS', gatewayPaymentId: input.paymentId, webhookVerified: input.webhookVerified, amount: input.amountRupees },
          });
          if (claim.count === 0) return null;
          transactionId = input.pendingId;
        } else {
          const created = await tx.transaction.create({
            data: {
              organizationId: input.organizationId,
              type: 'WALLET_TOPUP',
              amount: input.amountRupees,
              gatewayOrderId: input.orderId,
              gatewayPaymentId: input.paymentId,
              status: 'SUCCESS',
              webhookVerified: input.webhookVerified,
            },
          });
          transactionId = created.id;
        }
        const org = await tx.organization.update({
          where: { id: input.organizationId },
          data: { walletBalance: { increment: input.amountRupees } },
          select: { walletBalance: true },
        });
        await tx.transaction.update({ where: { id: transactionId }, data: { balanceAfter: org.walletBalance } });
        return { newBalance: org.walletBalance as unknown, transactionId };
      });
      if (out) {
        await this.notifications?.queue(input.organizationId, 'PAYMENT_RECEIVED', { amount: input.amountRupees, paymentId: input.paymentId });
      }
      return out;
    } catch (err: any) {
      if (err?.code === 'P2002') return null;
      throw err;
    }
  }

  async verifyPayment(organizationId: string, body: VerifyPaymentDto) {
    const orderId = body.razorpayOrderId || body.gatewayOrderId;
    const paymentId = body.razorpayPaymentId || body.gatewayPaymentId;
    const signature = body.razorpaySignature;

    if (!orderId || !paymentId || !signature) {
      throw new BadRequestException('Missing payment verification parameters (orderId, paymentId, signature)');
    }

    // Disallow fake / test signature bypass
    if (signature === 'simulated_valid_signature_hash') {
      throw new BadRequestException('Simulated test signatures are strictly forbidden in production');
    }

    const alreadyDone = async (transaction: unknown) => {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      return { newBalance: org?.walletBalance, transaction, message: 'Payment has already been processed and credited' };
    };

    // 1. Idempotency: this payment was already credited.
    const existingTx = await this.prisma.transaction.findFirst({ where: { gatewayPaymentId: paymentId } });
    if (existingTx && existingTx.status === 'SUCCESS') return alreadyDone(existingTx);

    // 2. Cryptographic HMAC verification using timingSafeEqual
    const expectedSignature = crypto.createHmac('sha256', this.razorpaySecret).update(`${orderId}|${paymentId}`).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new BadRequestException('Cryptographic Payment Signature Verification Failed! Tampered transaction.');
    }

    // 3. The amount comes from the order we created, not from the browser.
    const pending = await this.prisma.transaction.findFirst({
      where: { gatewayOrderId: orderId, organizationId, type: 'WALLET_TOPUP' },
    });
    if (!pending) throw new BadRequestException('This payment order was not created for your account.');
    if (pending.status === 'SUCCESS') return alreadyDone(pending);
    const amountRupees = Number(pending.amount);

    // 4. Confirm with Razorpay that this exact payment was captured for this order and amount.
    if (!this.usesMockGateway) {
      const payment = await this.razorpay(`/payments/${paymentId}`);
      if (payment.status !== 'captured' && payment.status !== 'authorized') {
        throw new BadRequestException(`Razorpay payment status is ${payment.status}, not authorized or captured.`);
      }
      if (payment.order_id !== orderId || Number(payment.amount) !== Math.round(amountRupees * 100)) {
        throw new BadRequestException('The payment does not match the order. Nothing was credited.');
      }
    }

    const settled = await this.settleTopup({ organizationId, orderId, paymentId, amountRupees, webhookVerified: false, pendingId: pending.id });
    if (!settled) return alreadyDone(pending);
    return { newBalance: settled.newBalance, transaction: { id: settled.transactionId } };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined, payload: any) {
    if (!signature) {
      throw new BadRequestException('x-razorpay-signature header is missing');
    }

    if (signature === 'simulated_valid_webhook_signature') {
      throw new BadRequestException('Simulated test webhook signatures are strictly forbidden');
    }

    // Verify HMAC over the RAW request buffer
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSignature = crypto.createHmac('sha256', this.webhookSecret).update(rawBuffer).digest('hex');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new BadRequestException('Cryptographic Webhook Signature Mismatch! Rejecting unauthorized payment notification.');
    }

    const event = payload?.event || 'payment.captured';
    const paymentEntity = payload?.payload?.payment?.entity || payload?.payment || {};
    const paymentId = paymentEntity.id;
    const orderId = paymentEntity.order_id;

    if (!paymentId) {
      return { status: 'ignored', message: 'No payment entity in webhook payload' };
    }

    // Never invent a credit amount: a webhook without a positive amount credits nothing.
    const amountInRupees = Number(paymentEntity.amount || 0) / 100;
    if (!(amountInRupees > 0)) {
      this.logger.warn(`Webhook for payment ${paymentId} has no positive amount; ignoring.`);
      return { status: 'ignored', message: 'Webhook payment amount is missing or not positive' };
    }

    // The order we created tells us which organization is paying; payment notes are the fallback.
    const pendingOrder = orderId
      ? await this.prisma.transaction.findFirst({ where: { gatewayOrderId: orderId, type: 'WALLET_TOPUP' } })
      : null;
    const orgId = pendingOrder?.organizationId || paymentEntity?.notes?.organizationId;
    if (!orgId) {
      this.logger.warn(`Webhook received for payment ${paymentId} without a known organization.`);
      return { status: 'ignored', message: 'Missing organizationId in notes' };
    }

    const targetOrg = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!targetOrg) {
      throw new BadRequestException(`Organization ${orgId} not found`);
    }

    // Idempotency check
    const existingTx = await this.prisma.transaction.findFirst({ where: { gatewayPaymentId: paymentId } });
    if (existingTx && existingTx.status === 'SUCCESS') {
      return { status: 'success', message: 'Payment already processed and credited (idempotent)', transactionId: existingTx.id };
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      const settled = await this.settleTopup({
        organizationId: targetOrg.id,
        orderId,
        paymentId,
        amountRupees: amountInRupees,
        webhookVerified: true,
        pendingId: pendingOrder && pendingOrder.status !== 'SUCCESS' ? pendingOrder.id : existingTx?.id,
      });
      if (!settled) {
        return { status: 'success', message: 'Payment already processed and credited (idempotent)' };
      }
      return {
        status: 'success',
        event,
        message: `Wallet credited with ₹${amountInRupees.toFixed(2)} via webhook`,
        data: { organizationId: targetOrg.id, newBalance: settled.newBalance, transactionId: settled.transactionId },
      };
    }

    return { status: 'acknowledged', message: `Handled webhook event: ${event}` };
  }
}
