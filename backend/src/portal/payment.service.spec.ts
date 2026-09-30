import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { PaymentService } from './payment.service.js';

const hmac = (secret: string, data: string | Buffer) => crypto.createHmac('sha256', secret).update(data).digest('hex');

describe('PaymentService', () => {
  let service: PaymentService;
  let prisma: any;
  let tx: any;
  let notifications: any;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = 'test_rzp_secret_key_12345';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_67890';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_123';

    tx = {
      transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'tx_new' }),
        update: vi.fn().mockResolvedValue({}),
      },
      organization: { update: vi.fn().mockResolvedValue({ walletBalance: 1500 }) },
    };
    prisma = {
      transaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({}) },
      organization: { findUnique: vi.fn().mockResolvedValue({ id: 'org_1', walletBalance: 1000 }) },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    service = new PaymentService(prisma, notifications);
  });

  describe('createOrder', () => {
    it('records a PENDING top-up so the credited amount comes from the server', async () => {
      const order = await service.createOrder('org_1', 500);
      expect(order.amount).toBe(500);
      expect(order.orderId).toMatch(/^order_mock_/);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: { organizationId: 'org_1', type: 'WALLET_TOPUP', amount: 500, status: 'PENDING', gatewayOrderId: order.orderId },
      });
    });

    it('rejects a zero or negative amount', async () => {
      await expect(service.createOrder('org_1', 0)).rejects.toThrow('more than zero');
      await expect(service.createOrder('org_1', -5)).rejects.toThrow('more than zero');
    });

    it('refuses placeholder keys in production', async () => {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        await expect(service.createOrder('org_1', 500)).rejects.toThrow('placeholder keys');
      } finally {
        process.env.NODE_ENV = prev;
      }
    });
  });

  describe('verifyPayment', () => {
    const pendingOrder = { id: 'pending_1', status: 'PENDING', amount: 2500, organizationId: 'org_1' };
    const body = (orderId = 'order_abc', paymentId = 'pay_xyz') => ({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: hmac(process.env.RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`),
    });

    it('rejects simulated signatures', async () => {
      await expect(
        service.verifyPayment('org_1', { razorpayOrderId: 'o', razorpayPaymentId: 'p', razorpaySignature: 'simulated_valid_signature_hash' }),
      ).rejects.toThrow('Simulated test signatures');
    });

    it('rejects tampered signatures', async () => {
      await expect(
        service.verifyPayment('org_1', { razorpayOrderId: 'order_abc', razorpayPaymentId: 'pay_xyz', razorpaySignature: 'a'.repeat(64) }),
      ).rejects.toThrow('Signature Verification Failed');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('credits the amount stored with the order, not anything the browser sends', async () => {
      prisma.transaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingOrder);
      const result: any = await service.verifyPayment('org_1', body());
      expect(tx.transaction.updateMany).toHaveBeenCalledWith({
        where: { id: 'pending_1', status: { not: 'SUCCESS' } },
        data: { status: 'SUCCESS', gatewayPaymentId: 'pay_xyz', webhookVerified: false, amount: 2500 },
      });
      expect(tx.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: { walletBalance: { increment: 2500 } },
        select: { walletBalance: true },
      });
      expect(result.newBalance).toBe(1500);
      expect(notifications.queue).toHaveBeenCalledWith('org_1', 'PAYMENT_RECEIVED', { amount: 2500, paymentId: 'pay_xyz' });
    });

    it('refuses an order that was not created for this account', async () => {
      prisma.transaction.findFirst.mockResolvedValue(null);
      await expect(service.verifyPayment('org_1', body())).rejects.toThrow('not created for your account');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not double-credit a payment that was already processed', async () => {
      prisma.transaction.findFirst.mockResolvedValue({ id: 'tx_existing', status: 'SUCCESS' });
      const result: any = await service.verifyPayment('org_1', body('order_abc', 'pay_done'));
      expect(result.message).toContain('already been processed');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('treats a lost race (another request claimed the order first) as already processed', async () => {
      prisma.transaction.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pendingOrder);
      tx.transaction.updateMany.mockResolvedValue({ count: 0 });
      const result: any = await service.verifyPayment('org_1', body());
      expect(result.message).toContain('already been processed');
      expect(tx.organization.update).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    const signed = (event: object) => {
      const raw = Buffer.from(JSON.stringify(event), 'utf8');
      return { raw, sig: hmac(process.env.RAZORPAY_WEBHOOK_SECRET!, raw), body: event };
    };
    const captured = (amount?: number, notes: object = { organizationId: 'org_1' }) => ({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount, notes } } },
    });

    it('rejects simulated and mismatching signatures', async () => {
      await expect(service.handleWebhook('{}', 'simulated_valid_webhook_signature', {})).rejects.toThrow('Simulated test webhook');
      await expect(service.handleWebhook('{}', 'b'.repeat(64), {})).rejects.toThrow('Signature Mismatch');
    });

    it('verifies the signature over the raw bytes and credits the captured amount', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org_1' });
      prisma.transaction.findFirst.mockResolvedValue(null);
      const { raw, sig, body } = signed(captured(100000));
      const result: any = await service.handleWebhook(raw, sig, body);
      expect(result.status).toBe('success');
      expect(tx.transaction.create).toHaveBeenCalled();
      expect(tx.organization.update).toHaveBeenCalledWith(expect.objectContaining({ data: { walletBalance: { increment: 1000 } } }));
    });

    it('uses the order we created to find the organization, and settles that pending row', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org_1' });
      prisma.transaction.findFirst
        .mockResolvedValueOnce({ id: 'pending_1', status: 'PENDING', organizationId: 'org_1' }) // by order id
        .mockResolvedValueOnce(null); // by payment id
      const { raw, sig, body } = signed(captured(50000, {}));
      await service.handleWebhook(raw, sig, body);
      expect(tx.transaction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'pending_1', status: { not: 'SUCCESS' } } }));
      expect(tx.transaction.create).not.toHaveBeenCalled();
    });

    it('never credits a made-up amount when the amount is missing or zero', async () => {
      for (const amount of [0, undefined]) {
        const { raw, sig, body } = signed(captured(amount));
        const result: any = await service.handleWebhook(raw, sig, body);
        expect(result.status).toBe('ignored');
      }
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('treats a concurrent duplicate delivery (unique violation) as already processed', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org_1' });
      prisma.transaction.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
      const { raw, sig, body } = signed(captured(50000));
      const result: any = await service.handleWebhook(raw, sig, body);
      expect(result.status).toBe('success');
      expect(result.message).toContain('idempotent');
    });

    it('ignores payments it cannot attribute to an organization', async () => {
      const { raw, sig, body } = signed(captured(50000, {}));
      const result: any = await service.handleWebhook(raw, sig, body);
      expect(result.status).toBe('ignored');
    });
  });
});
