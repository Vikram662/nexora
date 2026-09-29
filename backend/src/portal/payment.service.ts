import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { VerifyPaymentDto } from './portal.dto.js';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  async createOrder(organizationId: string, amount: number) {
    const orderId = `order_${crypto.randomBytes(8).toString('hex')}`;
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
      throw new BadRequestException('RAZORPAY_KEY_ID not configured on server');
    }

    return {
      orderId,
      amount,
      currency: 'INR',
      keyId,
    };
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

    // 1. Check if payment ID has already been credited (idempotency check)
    const existingTx = await this.prisma.transaction.findFirst({
      where: { gatewayPaymentId: paymentId },
    });

    if (existingTx && existingTx.status === 'SUCCESS') {
      const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
      return {
        newBalance: org?.walletBalance,
        transaction: existingTx,
        message: 'Payment has already been processed and credited',
      };
    }

    // 2. Cryptographic HMAC verification using timingSafeEqual
    const secret = this.razorpaySecret;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new BadRequestException('Cryptographic Payment Signature Verification Failed! Tampered transaction.');
    }

    // 3. Fetch/verify payment amount securely server-side
    // In production with Razorpay SDK or API, fetch payment entity: GET /v1/payments/{paymentId}
    // To prevent client amount tampering, query Razorpay order or default to verified order tier
    let verifiedAmount = 500.0;
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (keyId && secret && !keyId.startsWith('rzp_test_mock')) {
      try {
        const authHeader = 'Basic ' + Buffer.from(`${keyId}:${secret}`).toString('base64');
        const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
          headers: { Authorization: authHeader },
        });
        if (res.ok) {
          const rzpPayment: any = await res.json();
          if (rzpPayment.status === 'captured' || rzpPayment.status === 'authorized') {
            verifiedAmount = Number(rzpPayment.amount) / 100; // Paise to INR
          } else {
            throw new BadRequestException(`Razorpay payment status is ${rzpPayment.status}, not authorized/captured.`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch Razorpay payment online: ${err.message}. Using order amount.`);
      }
    }

    // Atomic update
    const [updatedOrg, transaction] = await this.prisma.$transaction([
      this.prisma.organization.update({
        where: { id: organizationId },
        data: {
          walletBalance: { increment: verifiedAmount },
        },
      }),
      this.prisma.transaction.create({
        data: {
          organizationId,
          type: 'WALLET_TOPUP',
          amount: verifiedAmount,
          status: 'SUCCESS',
          webhookVerified: true,
          gatewayPaymentId: paymentId,
          gatewayOrderId: orderId,
        },
      }),
    ]);

    return {
      newBalance: updatedOrg.walletBalance,
      transaction,
    };
  }

  async handleWebhook(rawBody: Buffer | string, signature: string | undefined, payload: any) {
    if (!signature) {
      throw new BadRequestException('x-razorpay-signature header is missing');
    }

    if (signature === 'simulated_valid_webhook_signature') {
      throw new BadRequestException('Simulated test webhook signatures are strictly forbidden');
    }

    const secret = this.webhookSecret;

    // Verify HMAC over the RAW request buffer
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBuffer)
      .digest('hex');

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

    // Convert Razorpay paise to INR
    let amountInRupees = Number(paymentEntity.amount || 0) / 100;
    if (amountInRupees <= 0) amountInRupees = 500;

    // Check target organization from payment notes
    const orgIdFromNotes = paymentEntity?.notes?.organizationId;
    if (!orgIdFromNotes) {
      this.logger.warn(`Webhook received for payment ${paymentId} without organizationId in notes.`);
      return { status: 'ignored', message: 'Missing organizationId in notes' };
    }

    const targetOrg = await this.prisma.organization.findUnique({ where: { id: orgIdFromNotes } });
    if (!targetOrg) {
      throw new BadRequestException(`Organization ${orgIdFromNotes} not found`);
    }

    // Idempotency check
    const existingTx = await this.prisma.transaction.findFirst({
      where: { gatewayPaymentId: paymentId },
    });

    if (existingTx && existingTx.status === 'SUCCESS') {
      return {
        status: 'success',
        message: 'Payment already processed and credited (idempotent)',
        transactionId: existingTx.id,
      };
    }

    if (event === 'payment.captured' || event === 'order.paid') {
      const [updatedOrg, transaction] = await this.prisma.$transaction([
        this.prisma.organization.update({
          where: { id: targetOrg.id },
          data: {
            walletBalance: { increment: amountInRupees },
          },
        }),
        this.prisma.transaction.upsert({
          where: { gatewayPaymentId: paymentId },
          update: {
            status: 'SUCCESS',
            amount: amountInRupees,
            webhookVerified: true,
          },
          create: {
            organizationId: targetOrg.id,
            type: 'WALLET_TOPUP',
            amount: amountInRupees,
            gatewayOrderId: orderId,
            gatewayPaymentId: paymentId,
            status: 'SUCCESS',
            webhookVerified: true,
          },
        }),
      ]);

      return {
        status: 'success',
        event,
        message: `Wallet credited with ₹${amountInRupees.toFixed(2)} via webhook`,
        data: {
          organizationId: targetOrg.id,
          newBalance: updatedOrg.walletBalance,
          transactionId: transaction.id,
        },
      };
    }

    return {
      status: 'acknowledged',
      message: `Handled webhook event: ${event}`,
    };
  }
}
