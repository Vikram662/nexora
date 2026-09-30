import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { PaymentService } from './payment.service.js';

describe('PaymentService Security & Integrity', () => {
  let paymentService: PaymentService;
  let mockPrisma: any;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = 'test_rzp_secret_key_12345';
    process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_67890';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_123';

    mockPrisma = {
      transaction: {
        findFirst: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
      },
      organization: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fns) => {
        return [{ walletBalance: 1500 }, { id: 'tx_123' }];
      }),
    };

    paymentService = new PaymentService(mockPrisma as any);
  });

  describe('verifyPayment HMAC and bypass prevention', () => {
    it('should reject simulated_valid_signature_hash test signatures', async () => {
      await expect(
        paymentService.verifyPayment('org_123', {
          razorpayOrderId: 'order_123',
          razorpayPaymentId: 'pay_123',
          razorpaySignature: 'simulated_valid_signature_hash',
        }),
      ).rejects.toThrow('Simulated test signatures are strictly forbidden');
    });

    it('should reject tampered or invalid cryptographic signatures', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      await expect(
        paymentService.verifyPayment('org_123', {
          razorpayOrderId: 'order_123',
          razorpayPaymentId: 'pay_123',
          razorpaySignature: 'invalid_tampered_signature_hex',
        }),
      ).rejects.toThrow('Cryptographic Payment Signature Verification Failed');
    });

    it('should succeed with genuine cryptographic HMAC-SHA256 signature', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      const orderId = 'order_abc';
      const paymentId = 'pay_xyz';
      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

      const result = await paymentService.verifyPayment('org_123', {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: validSignature,
      });

      expect(result).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should enforce idempotency and not double-credit existing payments', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue({
        id: 'tx_existing_99',
        status: 'SUCCESS',
      });
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org_123',
        walletBalance: 2000,
      });

      const orderId = 'order_abc';
      const paymentId = 'pay_already_credited';

      const result = await paymentService.verifyPayment('org_123', {
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: 'any_signature',
      });

      expect(result.message).toContain('already been processed');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook raw-body verification', () => {
    it('should verify signature over raw Buffer, not JSON.stringify', async () => {
      const rawPayload = Buffer.from(
        JSON.stringify({
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: 'pay_wb_1',
                order_id: 'order_wb_1',
                amount: 100000, // 1000 INR
                notes: { organizationId: 'org_wb_123' },
              },
            },
          },
        }),
        'utf8',
      );

      const validSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(rawPayload)
        .digest('hex');

      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_wb_123' });
      mockPrisma.transaction.findFirst.mockResolvedValue(null);

      const parsedJson = JSON.parse(rawPayload.toString('utf8'));
      const result = await paymentService.handleWebhook(rawPayload, validSignature, parsedJson);

      expect(result.status).toBe('success');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should reject simulated webhook test signatures', async () => {
      await expect(
        paymentService.handleWebhook('{}', 'simulated_valid_webhook_signature', {}),
      ).rejects.toThrow('Simulated test webhook signatures are strictly forbidden');
    });

    const signed = (body: object) => {
      const raw = Buffer.from(JSON.stringify(body), 'utf8');
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex');
      return { raw, sig, body };
    };
    const captured = (amount: number) => ({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_1', order_id: 'o1', amount, notes: { organizationId: 'org_1' } } } },
    });

    it('never credits a made-up amount when the webhook amount is missing or zero', async () => {
      for (const amount of [0, undefined as any]) {
        const { raw, sig, body } = signed(captured(amount));
        const result = await paymentService.handleWebhook(raw, sig, body);
        expect(result.status).toBe('ignored');
      }
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('treats a concurrent duplicate delivery (unique violation) as already processed', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({ id: 'org_1' });
      mockPrisma.transaction.findFirst.mockResolvedValue(null);
      mockPrisma.$transaction.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
      const { raw, sig, body } = signed(captured(50000));
      const result = await paymentService.handleWebhook(raw, sig, body);
      expect(result.status).toBe('success');
      expect(result.message).toContain('idempotent');
    });
  });
});
