'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchNotificationPreferences, updateNotificationPreferences, errorMessage } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

// Only emails the platform really sends. Each goes to the billing email of your organization.
const EMAILS_WE_SEND = [
  { title: 'Auto recharge notice', detail: 'Before we charge your saved card, so you can turn it off or change the amount.', critical: false },
  { title: 'Auto recharge failed', detail: 'When a charge fails or auto recharge is switched off after repeated failures.', critical: true },
  { title: 'Wallet balance is low', detail: 'Once a day at most, when the balance falls below the alert level.', critical: true },
  { title: 'API secret rotated', detail: 'When a project secret is rotated, with the time the old secret stops working.', critical: true },
  { title: 'Repeated failed API sign-ins', detail: 'When wrong secrets lock a project key. Once a day at most.', critical: true },
  { title: 'Webhook endpoint failing', detail: 'When the last 5 deliveries to an endpoint failed. Once a day at most.', critical: false },
  { title: 'Room limit reached', detail: 'When a project tries to open more rooms than its limit. Once a day at most.', critical: false },
  { title: 'Payment received', detail: 'When a wallet top-up is confirmed.', critical: false },
  { title: 'Tax invoice', detail: 'After each billing month closes, with the PDF attached. Email only.', critical: false },
  { title: 'Credit note', detail: 'When a credit note is issued against an invoice, with the PDF attached. Email only.', critical: false },
  { title: 'Business verification result', detail: 'When your KYC is approved or rejected, with the reason if rejected.', critical: false },
  { title: 'Welcome', detail: 'Once, when the account is created. Email only.', critical: false },
];

export default function NotificationsPage() {
  const { success, error: toastError } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [criticalOnlyViaSms, setCriticalOnlyViaSms] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotificationPreferences()
      .then((pref) => {
        if (pref) {
          setEmailEnabled(pref.emailEnabled ?? true);
          setSmsEnabled(pref.smsEnabled ?? false);
          setCriticalOnlyViaSms(pref.criticalOnlyViaSms ?? true);
        }
      })
      .catch(() => toastError('Could not load your notification settings. Refresh the page to try again.'))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateNotificationPreferences({ emailEnabled, smsEnabled, criticalOnlyViaSms });
      success('Notification settings saved.');
    } catch (err) {
      toastError(errorMessage(err, 'Could not save your notification settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <section className="border-t-2 border-ink pt-5">
        <h2 className="font-display text-lg font-semibold">Notifications</h2>
        <p className="text-xs text-muted mt-1 max-w-xl">
          Emails go to your organization&rsquo;s billing email. SMS goes to the phone number saved on the organization owner&rsquo;s{' '}
          <Link href="/user/profile" className="text-accent font-semibold hover:underline">profile</Link>.
        </p>

        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-sm font-semibold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              disabled={!loaded}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Send email notifications
          </label>
          <label className="flex items-center gap-3 text-sm font-semibold text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={smsEnabled}
              disabled={!loaded}
              onChange={(e) => setSmsEnabled(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Also send SMS
          </label>
          <label className={`flex items-center gap-3 text-sm ml-7 ${smsEnabled ? 'text-ink cursor-pointer' : 'text-muted'}`}>
            <input
              type="checkbox"
              checked={criticalOnlyViaSms}
              disabled={!loaded || !smsEnabled}
              onChange={(e) => setCriticalOnlyViaSms(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Only for urgent alerts (marked below)
          </label>
          <button
            type="submit"
            disabled={!loaded || saving}
            className="block px-4 py-2 bg-accent hover:bg-accent-deep text-white text-xs font-semibold rounded-md disabled:opacity-50 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </section>

      <section>
        <h3 className="font-display text-base font-semibold">What we send you</h3>
        <ul className="mt-2 border-t border-ink divide-y divide-line">
          {EMAILS_WE_SEND.map((item) => (
            <li key={item.title} className="py-3">
              <div className="text-sm font-semibold text-ink">
                {item.title}
                {item.critical && <span className="ml-2 text-[10px] font-semibold text-muted border border-line rounded-sm px-1.5 py-0.5">Urgent</span>}
              </div>
              <div className="text-xs text-muted mt-0.5">{item.detail}</div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted mt-4">
          SMS is sent only when the platform has an SMS provider set up and the owner has a phone number saved. Invoices, credit notes and the welcome message are email only.
        </p>
      </section>
    </div>
  );
}
