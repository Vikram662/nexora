import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { AutoRechargeService } from './auto-recharge.service.js';
import { PaymentService } from './payment.service.js';
import { buildEmail } from '../notifications/notification-templates.js';

const NOW = new Date('2026-09-30T10:00:00Z');
const HOUR = 60 * 60 * 1000;

const org = (over: object = {}): any => ({
  id: 'org_1',
  name: 'Acme',
  billingEmail: 'billing@acme.com',
  walletBalance: 40,
  autoRechargeEnabled: true,
  autoRechargeThreshold: 100,
  autoRechargeAmount: 1000,
  razorpayMandateId: 'token_1',
  razorpayCustomerId: 'cust_1',
  autoRechargeNoticeAt: null,
  autoRechargeLastAttemptAt: null,
  autoRechargeFailures: 0,
  autoRechargeLastError: null,
  ...over,
});

describe('AutoRechargeService', () => {
  const env = { ...process.env };
  let prisma: any;
  let payments: any;
  let notifications: any;
  let service: AutoRechargeService;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
    delete process.env.AUTO_RECHARGE_NOTICE_HOURS;
    delete process.env.AUTO_RECHARGE_MAX_AMOUNT;
    prisma = {
      organization: {
        findUnique: vi.fn().mockResolvedValue(org()),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      orgMember: { findFirst: vi.fn().mockResolvedValue({ user: { phone: '+919999999999' } }) },
      transaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    payments = {
      usesMockGateway: false,
      razorpay: vi.fn().mockResolvedValue({}),
      verifyPayment: vi.fn().mockResolvedValue({}),
      creditCapturedPayment: vi.fn().mockResolvedValue({}),
      recordAutoRechargeFailure: vi.fn().mockResolvedValue({ disabled: false }),
    };
    notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    service = new AutoRechargeService(prisma, payments, notifications);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  describe('settings', () => {
    it('cannot be turned on without a saved card', async () => {
      prisma.organization.findUnique.mockResolvedValue(org({ razorpayMandateId: null }));
      await expect(service.updateSettings('org_1', { enabled: true, threshold: 100, amount: 1000 })).rejects.toThrow('Add a payment card first');
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('can be turned off, and saves the level and amount, without a card', async () => {
      prisma.organization.findUnique.mockResolvedValue(org({ razorpayMandateId: null }));
      await service.updateSettings('org_1', { enabled: false, threshold: 200, amount: 2000 });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: expect.objectContaining({ autoRechargeEnabled: false, autoRechargeThreshold: 200, autoRechargeAmount: 2000, autoRechargeFailures: 0, autoRechargeNoticeAt: null }),
      });
    });

    it('keeps the level and amount in sensible limits, including the RBI ceiling', async () => {
      await expect(service.updateSettings('org_1', { enabled: true, threshold: 10, amount: 1000 })).rejects.toThrow(BadRequestException);
      await expect(service.updateSettings('org_1', { enabled: true, threshold: 100, amount: 50 })).rejects.toThrow('between');
      await expect(service.updateSettings('org_1', { enabled: true, threshold: 100, amount: 15001 })).rejects.toThrow('15000');
      process.env.AUTO_RECHARGE_MAX_AMOUNT = '5000';
      await expect(service.updateSettings('org_1', { enabled: true, threshold: 100, amount: 6000 })).rejects.toThrow('5000');
    });
  });

  describe('saving a card', () => {
    it('needs real Razorpay keys and the owner phone number', async () => {
      payments.usesMockGateway = true;
      await expect(service.startSetup('org_1', 500)).rejects.toThrow(ServiceUnavailableException);
      payments.usesMockGateway = false;
      prisma.orgMember.findFirst.mockResolvedValue({ user: { phone: null } });
      await expect(service.startSetup('org_1', 500)).rejects.toThrow('mobile number');
    });

    it('creates the customer once and a tokenization order with a pending top-up', async () => {
      prisma.organization.findUnique.mockResolvedValue(org({ razorpayCustomerId: null }));
      payments.razorpay.mockResolvedValueOnce({ id: 'cust_new' }).mockResolvedValueOnce({ id: 'order_setup' });
      const result = await service.startSetup('org_1', 500);
      expect(payments.razorpay.mock.calls[0]).toEqual(['/customers', { method: 'POST', body: expect.objectContaining({ email: 'billing@acme.com', contact: '+919999999999' }) }]);
      const orderBody = payments.razorpay.mock.calls[1][1].body;
      expect(orderBody).toMatchObject({ amount: 50000, currency: 'INR', customer_id: 'cust_new', method: 'card' });
      expect(orderBody.token).toMatchObject({ max_amount: 1500000, frequency: 'as_presented' });
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org_1' }, data: { razorpayCustomerId: 'cust_new' } });
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: { organizationId: 'org_1', type: 'WALLET_TOPUP', amount: 500, status: 'PENDING', gatewayOrderId: 'order_setup' },
      });
      expect(result).toEqual({ orderId: 'order_setup', customerId: 'cust_new', keyId: 'rzp_test_key', amount: 500 });
    });

    it('keeps the card token after the first payment is verified and credited', async () => {
      payments.razorpay.mockResolvedValue({ token_id: 'token_9' });
      await service.confirmSetup('org_1', { razorpayOrderId: 'o', razorpayPaymentId: 'pay_1', razorpaySignature: 's' });
      expect(payments.verifyPayment).toHaveBeenCalled();
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org_1' }, data: { razorpayMandateId: 'token_9' } });
    });

    it('says so when the payment worked but no card token came back', async () => {
      payments.razorpay.mockResolvedValue({});
      await expect(service.confirmSetup('org_1', { razorpayOrderId: 'o', razorpayPaymentId: 'pay_1', razorpaySignature: 's' })).rejects.toThrow('could not be saved');
    });

    it('removing the card switches auto recharge off', async () => {
      await service.removeMethod('org_1');
      expect(payments.razorpay).toHaveBeenCalledWith('/customers/cust_1/tokens/token_1', { method: 'DELETE' });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_1' },
        data: expect.objectContaining({ razorpayMandateId: null, autoRechargeEnabled: false }),
      });
    });
  });

  describe('deciding when to charge', () => {
    it('does nothing while the balance is above the level, and clears an old notice', async () => {
      expect(await service.evaluate(org({ walletBalance: 500, autoRechargeNoticeAt: NOW }), NOW)).toBe('ok');
      expect(prisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: 'org_1', autoRechargeNoticeAt: { not: null } }, data: { autoRechargeNoticeAt: null } });
      expect(payments.razorpay).not.toHaveBeenCalled();
    });

    it('first tells the customer, and does not charge yet', async () => {
      expect(await service.evaluate(org(), NOW)).toBe('notified');
      expect(prisma.organization.updateMany).toHaveBeenCalledWith({ where: { id: 'org_1', autoRechargeNoticeAt: null }, data: { autoRechargeNoticeAt: NOW } });
      expect(notifications.queue).toHaveBeenCalledWith('org_1', 'AUTO_RECHARGE_NOTICE', expect.objectContaining({ balance: 40, threshold: 100, amount: 1000 }));
      expect(payments.razorpay).not.toHaveBeenCalled();
    });

    it('waits out the notice period before charging', async () => {
      expect(await service.evaluate(org({ autoRechargeNoticeAt: new Date(NOW.getTime() - 23 * HOUR) }), NOW)).toBe('waiting_notice');
      expect(payments.razorpay).not.toHaveBeenCalled();
    });

    it('charges the saved card once the notice period is over and the balance is still low', async () => {
      payments.razorpay.mockResolvedValueOnce({ id: 'order_auto' }).mockResolvedValueOnce({ razorpay_payment_id: 'pay_auto' });
      expect(await service.evaluate(org({ autoRechargeNoticeAt: new Date(NOW.getTime() - 25 * HOUR) }), NOW)).toBe('charged');
      expect(payments.razorpay.mock.calls[0][0]).toBe('/orders');
      expect(payments.razorpay.mock.calls[1]).toEqual([
        '/payments/create/recurring',
        {
          method: 'POST',
          body: expect.objectContaining({ amount: 100000, order_id: 'order_auto', customer_id: 'cust_1', token: 'token_1', recurring: '1', contact: '+919999999999' }),
        },
      ]);
      expect(prisma.transaction.create).toHaveBeenCalledWith({
        data: { organizationId: 'org_1', type: 'AUTO_RECHARGE', amount: 1000, status: 'PENDING', gatewayOrderId: 'order_auto' },
      });
    });

    it('charges straight away when the notice period is set to 0', async () => {
      process.env.AUTO_RECHARGE_NOTICE_HOURS = '0';
      payments.razorpay.mockResolvedValueOnce({ id: 'order_auto' }).mockResolvedValueOnce({});
      expect(await service.evaluate(org(), NOW)).toBe('charged');
      expect(notifications.queue).not.toHaveBeenCalled();
    });

    it('never charges twice at once: the attempt has to be claimed first', async () => {
      process.env.AUTO_RECHARGE_NOTICE_HOURS = '0';
      prisma.organization.updateMany.mockResolvedValue({ count: 0 });
      expect(await service.evaluate(org(), NOW)).toBe('waiting');
      expect(payments.razorpay).not.toHaveBeenCalled();
    });

    it('waits for a charge that is already in flight', async () => {
      prisma.transaction.findFirst.mockResolvedValue({ id: 't1', gatewayOrderId: 'order_x', amount: 1000, createdAt: new Date(NOW.getTime() - 30 * 1000) });
      expect(await service.evaluate(org(), NOW)).toBe('waiting');
      expect(payments.razorpay).not.toHaveBeenCalled();
    });

    it('does nothing with placeholder Razorpay keys, and stops after too many failures', async () => {
      payments.usesMockGateway = true;
      expect(await service.evaluate(org(), NOW)).toBe('skipped');
      payments.usesMockGateway = false;
      expect(await service.evaluate(org({ autoRechargeFailures: 3 }), NOW)).toBe('skipped');
    });
  });

  describe('failures', () => {
    it('counts a declined card and does not leave a pending charge behind', async () => {
      process.env.AUTO_RECHARGE_NOTICE_HOURS = '0';
      payments.razorpay.mockResolvedValueOnce({ id: 'order_auto' }).mockRejectedValueOnce(new Error('Card declined'));
      expect(await service.evaluate(org(), NOW)).toBe('failed');
      expect(prisma.transaction.updateMany).toHaveBeenCalledWith({ where: { gatewayOrderId: 'order_auto', status: 'PENDING' }, data: { status: 'FAILED' } });
      expect(payments.recordAutoRechargeFailure).toHaveBeenCalledWith('org_1', 'Card declined');
    });

    it('counts a failure if the owner phone number is gone', async () => {
      process.env.AUTO_RECHARGE_NOTICE_HOURS = '0';
      prisma.orgMember.findFirst.mockResolvedValue({ user: { phone: null } });
      expect(await service.evaluate(org(), NOW)).toBe('failed');
      expect(payments.recordAutoRechargeFailure).toHaveBeenCalled();
    });
  });

  describe('waiting on the bank', () => {
    const pending = (ageMs: number) => ({ id: 't1', gatewayOrderId: 'order_x', amount: 1000, createdAt: new Date(NOW.getTime() - ageMs) });

    it('credits a charge Razorpay says is captured, even if the webhook never came', async () => {
      prisma.transaction.findFirst.mockResolvedValue(pending(10 * 60 * 1000));
      payments.razorpay.mockResolvedValue({ items: [{ id: 'pay_1', status: 'captured' }] });
      expect(await service.evaluate(org(), NOW)).toBe('ok');
      expect(payments.creditCapturedPayment).toHaveBeenCalledWith({ organizationId: 'org_1', orderId: 'order_x', paymentId: 'pay_1', amountRupees: 1000, pendingId: 't1' });
    });

    it('marks a declined charge as failed and counts it', async () => {
      prisma.transaction.findFirst.mockResolvedValue(pending(10 * 60 * 1000));
      payments.razorpay.mockResolvedValue({ items: [{ id: 'pay_1', status: 'failed', error_description: 'Insufficient funds' }] });
      expect(await service.evaluate(org(), NOW)).toBe('failed');
      expect(payments.recordAutoRechargeFailure).toHaveBeenCalledWith('org_1', 'Insufficient funds');
    });

    it('gives up on a charge nobody confirmed after 2 hours', async () => {
      prisma.transaction.findFirst.mockResolvedValue(pending(3 * HOUR));
      payments.razorpay.mockResolvedValue({ items: [] });
      expect(await service.evaluate(org(), NOW)).toBe('failed');
      expect(payments.recordAutoRechargeFailure).toHaveBeenCalledWith('org_1', expect.stringContaining('did not confirm'));
    });

    it('keeps waiting while the bank has not answered yet', async () => {
      prisma.transaction.findFirst.mockResolvedValue(pending(10 * 60 * 1000));
      payments.razorpay.mockResolvedValue({ items: [{ id: 'pay_1', status: 'created' }] });
      expect(await service.evaluate(org(), NOW)).toBe('waiting');
      expect(payments.recordAutoRechargeFailure).not.toHaveBeenCalled();
    });
  });

  it('processDue only looks at organizations with auto recharge on and one failing org does not stop the rest', async () => {
    process.env.AUTO_RECHARGE_NOTICE_HOURS = '0';
    prisma.organization.findMany.mockResolvedValue([org({ id: 'a' }), org({ id: 'b', walletBalance: 900 })]);
    prisma.transaction.findFirst.mockRejectedValueOnce(new Error('db hiccup'));
    const tally = await service.processDue(NOW);
    expect(prisma.organization.findMany.mock.calls[0][0].where).toMatchObject({ autoRechargeEnabled: true });
    expect(tally).toEqual({ error: 1, ok: 1 });
  });
});

describe('PaymentService auto recharge accounting', () => {
  let prisma: any;
  let notifications: any;
  let service: PaymentService;

  beforeEach(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = 'wh_secret';
    process.env.RAZORPAY_KEY_SECRET = 'key_secret';
    process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_1';
    prisma = {
      organization: {
        update: vi.fn().mockResolvedValue({ autoRechargeFailures: 1 }),
        findUnique: vi.fn().mockResolvedValue({ id: 'org_1' }),
      },
      transaction: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn().mockResolvedValue({}) },
    };
    notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    service = new PaymentService(prisma, notifications);
  });

  it('counts a failed charge and emails the customer, without switching off yet', async () => {
    await expect(service.recordAutoRechargeFailure('org_1', 'Card declined')).resolves.toEqual({ disabled: false });
    expect(prisma.organization.update.mock.calls[0][0].data).toMatchObject({ autoRechargeFailures: { increment: 1 }, autoRechargeLastError: 'Card declined' });
    expect(notifications.queue).toHaveBeenCalledWith('org_1', 'AUTO_RECHARGE_FAILED', { reason: 'Card declined', disabled: false });
  });

  it('switches auto recharge off after the third failure in a row', async () => {
    prisma.organization.update.mockResolvedValueOnce({ autoRechargeFailures: 3 });
    await expect(service.recordAutoRechargeFailure('org_1', 'Card declined')).resolves.toEqual({ disabled: true });
    expect(prisma.organization.update).toHaveBeenLastCalledWith({ where: { id: 'org_1' }, data: { autoRechargeEnabled: false } });
    expect(notifications.queue).toHaveBeenCalledWith('org_1', 'AUTO_RECHARGE_FAILED', { reason: 'Card declined', disabled: true });
  });

  it('turns a payment.failed webhook for an automatic charge into a counted failure', async () => {
    const crypto = await import('node:crypto');
    prisma.transaction.findFirst.mockResolvedValue({ id: 't1', organizationId: 'org_1', status: 'PENDING', type: 'AUTO_RECHARGE' });
    const body = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_x', error_description: 'Insufficient funds' } } } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac('sha256', 'wh_secret').update(raw).digest('hex');
    const result: any = await service.handleWebhook(raw, sig, body);
    expect(result.status).toBe('success');
    expect(prisma.transaction.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'FAILED', webhookVerified: true } });
    expect(notifications.queue).toHaveBeenCalledWith('org_1', 'AUTO_RECHARGE_FAILED', { reason: 'Insufficient funds', disabled: false });
  });

  it('ignores failed payments that are not automatic charges', async () => {
    const crypto = await import('node:crypto');
    prisma.transaction.findFirst.mockResolvedValue(null);
    const body = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_1', order_id: 'order_manual' } } } };
    const raw = Buffer.from(JSON.stringify(body));
    const sig = crypto.createHmac('sha256', 'wh_secret').update(raw).digest('hex');
    const result: any = await service.handleWebhook(raw, sig, body);
    expect(result.status).toBe('ignored');
    expect(notifications.queue).not.toHaveBeenCalled();
  });
});

describe('auto recharge emails', () => {
  const ctx = { siteName: 'Nexora', organizationName: 'Acme', appUrl: 'https://app.example.com' };

  it('tells the customer when the charge will happen and how to stop it', () => {
    const email = buildEmail('AUTO_RECHARGE_NOTICE', { balance: 40, threshold: 100, amount: 1000, chargeOn: '1 Oct 2026, 3:30 pm IST' }, ctx)!;
    expect(email.subject).toBe('We will recharge your wallet with ₹1,000.00');
    expect(email.text).toContain('1 Oct 2026, 3:30 pm IST');
    expect(email.text).toContain('turn auto recharge off');
  });

  it('says when auto recharge was switched off after failures', () => {
    const off = buildEmail('AUTO_RECHARGE_FAILED', { reason: 'Card declined', disabled: true }, ctx)!;
    expect(off.subject).toBe('Auto recharge was switched off');
    expect(buildEmail('AUTO_RECHARGE_FAILED', { reason: 'Card declined', disabled: false }, ctx)!.subject).toBe('Auto recharge failed');
  });
});
