'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchAutoRecharge,
  saveAutoRecharge,
  startAutoRechargeSetup,
  confirmAutoRechargeSetup,
  removeAutoRechargeCard,
  errorMessage,
  type AutoRechargeStatus,
} from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

/** Auto recharge: an on/off switch, the level and amount, and the saved card. `onWalletChange` refreshes the balance. */
export function AutoRecharge({ onWalletChange }: { onWalletChange: () => void }) {
  const { success, error: toastError, confirm } = useToast();
  const [status, setStatus] = useState<AutoRechargeStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState('');
  const [amount, setAmount] = useState('');
  const [firstAmount, setFirstAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [settingUp, setSettingUp] = useState(false);

  const apply = useCallback((s: AutoRechargeStatus) => {
    setStatus(s);
    setEnabled(s.enabled);
    setThreshold(s.threshold === null ? '' : String(s.threshold));
    setAmount(s.amount === null ? '' : String(s.amount));
    setFirstAmount((current) => current || (s.amount === null ? '' : String(s.amount)));
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(fetchAutoRecharge)
      .then(apply)
      .catch(() => toastError('Could not load auto recharge. Refresh the page to try again.'));
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!status) {
    return <p className="text-xs text-muted" role="status">Loading auto recharge...</p>;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      apply(await saveAutoRecharge({ enabled, threshold: Number(threshold), amount: Number(amount) }));
      success(enabled ? 'Auto recharge is on.' : 'Auto recharge is off.');
    } catch (err) {
      toastError(errorMessage(err, 'Could not save auto recharge'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCard = async () => {
    if (typeof window === 'undefined' || !window.Razorpay) {
      toastError('The payment window could not load. Turn off your ad blocker or check your connection, then try again.');
      return;
    }
    setSettingUp(true);
    try {
      const order = await startAutoRechargeSetup(Number(firstAmount));
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount * 100,
        currency: 'INR',
        name: 'Nexora RTC',
        description: `Add ₹${order.amount} and save your card for auto recharge`,
        order_id: order.orderId,
        customer_id: order.customerId,
        recurring: '1',
        handler: async (response: { razorpay_order_id?: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            apply(
              await confirmAutoRechargeSetup({
                razorpayOrderId: response.razorpay_order_id || order.orderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              }),
            );
            success('Card saved and money added. You can now turn auto recharge on.');
            onWalletChange();
          } catch (err) {
            toastError(errorMessage(err, 'Could not save the card'));
            onWalletChange();
          }
        },
        modal: { ondismiss: () => setSettingUp(false) },
        theme: { color: '#2a3fe0' },
      });
      checkout.on('payment.failed', (resp: { error: { description: string } }) => toastError(`Payment failed: ${resp.error.description}`));
      checkout.open();
    } catch (err) {
      toastError(errorMessage(err, 'Could not start saving the card'));
    } finally {
      setSettingUp(false);
    }
  };

  const handleRemoveCard = async () => {
    const ok = await confirm({
      title: 'Remove the saved card?',
      message: 'Auto recharge will switch off. You can save a card again later.',
      confirmLabel: 'Remove card',
      danger: true,
    });
    if (!ok) return;
    try {
      apply(await removeAutoRechargeCard());
      success('Card removed.');
    } catch (err) {
      toastError(errorMessage(err, 'Could not remove the card'));
    }
  };

  return (
    <section aria-labelledby="auto-recharge-heading" className="space-y-4 max-w-2xl">
      <div>
        <h3 id="auto-recharge-heading" className="font-display text-base font-semibold">Auto recharge</h3>
        <p className="text-xs text-muted mt-1">
          When your balance falls below the level you set, we charge your saved card and add the money, so calls never stop for lack of balance.
          {status.noticeHours > 0
            ? ` We email you ${status.noticeHours} hours before each charge, and skip it if the balance is back above the level.`
            : ''}{' '}
          After {status.maxFailures} failed charges in a row it switches itself off.
        </p>
      </div>

      {status.lastError && status.failures > 0 && (
        <p role="alert" className="text-xs text-red-700">
          The last charge failed: {status.lastError}
          {!status.enabled && ' Auto recharge is off.'}
        </p>
      )}

      <form onSubmit={handleSave} className="space-y-3 text-xs">
        <label className="flex items-center gap-3 text-sm font-semibold text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!status.hasPaymentMethod && !enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Recharge automatically
        </label>
        {!status.hasPaymentMethod && <p className="text-muted">Save a card below to turn this on.</p>}

        <div className="grid sm:grid-cols-2 gap-3 max-w-md">
          <label className="block">
            <span className="block font-semibold text-ink mb-1">When the balance is below (₹)</span>
            <input
              type="number"
              min={50}
              step="1"
              required
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md tabular"
            />
          </label>
          <label className="block">
            <span className="block font-semibold text-ink mb-1">Add this much (₹)</span>
            <input
              type="number"
              min={100}
              max={status.maxAmount}
              step="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 bg-paper border border-line rounded-md tabular"
            />
            <span className="block text-muted mt-1">Up to ₹{status.maxAmount.toLocaleString('en-IN')} each time.</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-semibold rounded-md disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save auto recharge'}
        </button>
      </form>

      <div className="border-t border-line pt-4 text-xs space-y-3">
        <div className="font-semibold text-ink">Saved card</div>
        {status.hasPaymentMethod ? (
          <div className="flex items-center gap-4">
            <span className="text-ink">A card is saved for auto recharge.</span>
            <button onClick={handleRemoveCard} className="font-semibold text-red-700 hover:underline cursor-pointer">
              Remove card
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted">
              You pay a first top-up now, and the bank asks you to allow future automatic charges on that card. Cards only. Your mobile number in Profile is needed for this.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="block font-semibold text-ink mb-1">First top-up (₹)</span>
                <input
                  type="number"
                  min={100}
                  max={status.maxAmount}
                  step="1"
                  value={firstAmount}
                  onChange={(e) => setFirstAmount(e.target.value)}
                  className="w-36 px-3 py-2 bg-paper border border-line rounded-md tabular"
                />
              </label>
              <button
                type="button"
                onClick={handleSaveCard}
                disabled={settingUp || !firstAmount}
                className="px-4 py-2 border border-ink text-ink font-semibold rounded-md hover:bg-ink hover:text-white disabled:opacity-50 cursor-pointer transition-colors"
              >
                {settingUp ? 'Opening...' : 'Save a card and add money'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
