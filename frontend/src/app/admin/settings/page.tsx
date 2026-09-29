'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Save, Globe, Phone, Share2, Megaphone, IndianRupee, LayoutList, Server } from 'lucide-react';
import { fetchAdminSettings, updateAdminSettings, errorMessage } from '@/lib/api';
import type {
  AdminSettingsData,
  PlanDisplay,
  PlanTier,
  RateRoomType,
  RateUpdate,
  UpdateSettingsPayload,
} from '@/lib/types';

const PLAN_TIERS: PlanTier[] = ['STARTER', 'GROWTH', 'ENTERPRISE'];
const RATE_TYPES: { type: RateRoomType; label: string }[] = [
  { type: 'AUDIO_CALL', label: 'Audio' },
  { type: 'VIDEO_CALL', label: 'Video' },
  { type: 'LIVE_BROADCAST', label: 'Broadcast' },
];

type RateInputs = Record<PlanTier, Record<RateRoomType, string>>;

function toRateInputs(rates: AdminSettingsData['rates']): RateInputs {
  const out = {} as RateInputs;
  for (const tier of PLAN_TIERS) {
    out[tier] = {} as Record<RateRoomType, string>;
    for (const { type } of RATE_TYPES) {
      const value = rates[tier]?.[type];
      out[tier][type] = value === undefined ? '' : String(value);
    }
  }
  return out;
}

function changedRates(original: RateInputs, next: RateInputs): RateUpdate[] {
  const updates: RateUpdate[] = [];
  for (const tier of PLAN_TIERS) {
    for (const { type } of RATE_TYPES) {
      const raw = next[tier][type].trim();
      if (raw === '' || raw === original[tier][type]) continue;
      updates.push({ planTier: tier, roomType: type, ratePerMinute: Number(raw) });
    }
  }
  return updates;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number';
  step?: string;
  multiline?: boolean;
}

function Field({ label, value, onChange, hint, type = 'text', step, multiline }: FieldProps) {
  const inputClass =
    'w-full px-3 py-2 bg-white border border-line rounded-md text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent';
  return (
    <label className="block text-xs">
      <span className="block font-semibold text-ink mb-1">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className={inputClass} />
      ) : (
        <input type={type} step={step} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {hint && <span className="block text-muted mt-1">{hint}</span>}
    </label>
  );
}

function Panel({ icon: Icon, title, children }: { icon: typeof Globe; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white p-6 rounded-lg border border-line space-y-4">
      <h2 className="text-sm font-bold text-ink flex items-center gap-2 border-b border-line pb-3">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-line last:border-0">
      <span className="text-ink">{label}</span>
      <span className={ok ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>{ok ? 'Configured' : 'Not set'}</span>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [loaded, setLoaded] = useState<AdminSettingsData | null>(null);
  const [form, setForm] = useState<AdminSettingsData | null>(null);
  const [rateInputs, setRateInputs] = useState<RateInputs | null>(null);
  const [originalRates, setOriginalRates] = useState<RateInputs | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyLoaded = (data: AdminSettingsData) => {
    const inputs = toRateInputs(data.rates);
    setLoaded(data);
    setForm(data);
    setRateInputs(inputs);
    setOriginalRates(inputs);
  };

  useEffect(() => {
    let cancelled = false;
    fetchAdminSettings()
      .then((res) => {
        if (!cancelled) applyLoaded(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err, 'Failed to load settings'));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pendingRates = useMemo(
    () => (originalRates && rateInputs ? changedRates(originalRates, rateInputs) : []),
    [originalRates, rateInputs],
  );

  if (!form || !rateInputs || !loaded) {
    return <p className="text-sm text-muted">{error ?? 'Loading settings…'}</p>;
  }

  const patch = <K extends 'contact' | 'brand' | 'social' | 'billing'>(section: K, key: keyof AdminSettingsData[K], value: string) =>
    setForm({ ...form, [section]: { ...form[section], [key]: value } });

  const patchPlan = (tier: PlanTier, key: keyof PlanDisplay, value: string) =>
    setForm({ ...form, plans: form.plans.map((p) => (p.tier === tier ? { ...p, [key]: value } : p)) });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: UpdateSettingsPayload = {
      contact: form.contact,
      brand: form.brand,
      social: form.social,
      billing: { gstPercent: Number(form.billing.gstPercent), sacCode: form.billing.sacCode },
      plans: form.plans,
      rates: pendingRates,
    };
    try {
      const res = await updateAdminSettings(payload);
      applyLoaded(res.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(errorMessage(err, 'Failed to save settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Website, pricing and billing settings</h1>
          <p className="text-xs text-muted mt-1">
            Everything here is stored in the database. The public site and per-minute billing read it directly.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-ink text-paper text-sm font-medium rounded-md flex items-center gap-1.5 hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {saved && (
        <div role="status" className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Settings saved. The website picks them up within a minute.
        </div>
      )}
      {error && (
        <div role="alert" className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Panel icon={Globe} title="Brand and logo">
          <Field label="Site name" value={form.brand.siteName} onChange={(v) => patch('brand', 'siteName', v)} />
          <Field label="Tagline" value={form.brand.tagline} onChange={(v) => patch('brand', 'tagline', v)} />
          <Field
            label="Logo URL"
            type="url"
            value={form.brand.logoUrl}
            onChange={(v) => patch('brand', 'logoUrl', v)}
            hint="Public https link to a PNG or SVG. Leave empty to show the text wordmark."
          />
          {form.brand.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.brand.logoUrl} alt="Logo preview" className="h-10 w-auto border border-line rounded p-1 bg-paper" />
          )}
        </Panel>

        <Panel icon={Megaphone} title="Announcement bar">
          <Field
            label="Message"
            multiline
            value={form.brand.announcement}
            onChange={(v) => patch('brand', 'announcement', v)}
            hint="Shown at the very top of the website. Leave empty to hide it."
          />
        </Panel>

        <Panel icon={Phone} title="Contact details">
          <Field label="Company name" value={form.contact.companyName} onChange={(v) => patch('contact', 'companyName', v)} />
          <Field label="Email" type="email" value={form.contact.email} onChange={(v) => patch('contact', 'email', v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone" type="tel" value={form.contact.phone} onChange={(v) => patch('contact', 'phone', v)} />
            <Field label="WhatsApp" type="tel" value={form.contact.whatsapp} onChange={(v) => patch('contact', 'whatsapp', v)} />
          </div>
          <Field label="Address" multiline value={form.contact.address} onChange={(v) => patch('contact', 'address', v)} />
          <Field label="Support hours" value={form.contact.supportHours} onChange={(v) => patch('contact', 'supportHours', v)} hint="For example: Mon-Sat, 10:00-19:00 IST" />
        </Panel>

        <Panel icon={Share2} title="Social links">
          <Field label="LinkedIn" type="url" value={form.social.linkedin} onChange={(v) => patch('social', 'linkedin', v)} />
          <Field label="X / Twitter" type="url" value={form.social.twitter} onChange={(v) => patch('social', 'twitter', v)} />
          <Field label="GitHub" type="url" value={form.social.github} onChange={(v) => patch('social', 'github', v)} />
          <Field label="YouTube" type="url" value={form.social.youtube} onChange={(v) => patch('social', 'youtube', v)} />
        </Panel>
      </div>

      <Panel icon={IndianRupee} title="Per-minute rates (before GST)">
        <p className="text-xs text-muted">
          Billing charges these rates. Saving a changed value adds a new effective-dated rate, so earlier usage keeps its old price.
          An organization-specific override still wins over the plan rate.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted border-b border-line">
                <th scope="col" className="py-2 pr-4 font-medium">Plan</th>
                {RATE_TYPES.map(({ type, label }) => (
                  <th key={type} scope="col" className="py-2 pr-4 font-medium">
                    {label} (₹/min)
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLAN_TIERS.map((tier) => (
                <tr key={tier} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-4 text-left font-semibold">{tier}</th>
                  {RATE_TYPES.map(({ type, label }) => (
                    <td key={type} className="py-2 pr-4">
                      <input
                        type="number"
                        min="0"
                        step="0.0001"
                        aria-label={`${tier} ${label} rate per minute`}
                        value={rateInputs[tier][type]}
                        onChange={(e) =>
                          setRateInputs({ ...rateInputs, [tier]: { ...rateInputs[tier], [type]: e.target.value } })
                        }
                        className="w-28 px-2 py-1.5 bg-white border border-line rounded-md tabular-nums focus:outline-none focus:border-accent"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <Field label="GST %" type="number" step="0.01" value={String(form.billing.gstPercent)} onChange={(v) => patch('billing', 'gstPercent', v)} />
          <Field label="SAC code" value={form.billing.sacCode} onChange={(v) => patch('billing', 'sacCode', v)} />
        </div>
        {pendingRates.length > 0 && (
          <p className="text-xs text-amber-800">{pendingRates.length} rate change(s) will take effect when you save.</p>
        )}
      </Panel>

      <Panel icon={LayoutList} title="Plans shown on the website">
        <p className="text-xs text-muted">
          The per-minute figure on the pricing table comes from the Video rate above, so it always matches billing.
        </p>
        <div className="space-y-5">
          {form.plans.map((plan) => (
            <fieldset key={plan.tier} className="border border-line rounded-md p-4 space-y-3">
              <legend className="px-1 text-xs font-bold">{plan.tier}</legend>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Display name" value={plan.name} onChange={(v) => patchPlan(plan.tier, 'name', v)} />
                <Field label="Platform fee text" value={plan.platformFee} onChange={(v) => patchPlan(plan.tier, 'platformFee', v)} />
                <Field label="Concurrent rooms" value={plan.maxRooms} onChange={(v) => patchPlan(plan.tier, 'maxRooms', v)} />
                <Field label="People per room" value={plan.maxParticipants} onChange={(v) => patchPlan(plan.tier, 'maxParticipants', v)} />
              </div>
              <Field label="Includes" value={plan.includes} onChange={(v) => patchPlan(plan.tier, 'includes', v)} />
            </fieldset>
          ))}
        </div>
      </Panel>

      <Panel icon={Server} title="Server configuration (read-only, set in environment)">
        <div className="grid md:grid-cols-2 gap-x-8">
          <div>
            <StatusRow label="LiveKit URL" ok={Boolean(loaded.livekitHost)} />
            <StatusRow label="TURN host" ok={Boolean(loaded.coturnHost)} />
            <StatusRow label="Razorpay key id" ok={loaded.razorpayKeyIdSet} />
            <StatusRow label="Razorpay key secret" ok={loaded.razorpayKeySecretSet} />
            <StatusRow label="Razorpay webhook secret" ok={loaded.razorpayWebhookSecretSet} />
          </div>
          <div>
            <StatusRow label={`SMTP host${loaded.smtpHost ? ` (${loaded.smtpHost})` : ''}`} ok={Boolean(loaded.smtpHost)} />
            <StatusRow label="SMTP user" ok={loaded.smtpUserSet} />
            <StatusRow label="SMTP password" ok={loaded.smtpPasswordSet} />
            <StatusRow label="Email from address" ok={Boolean(loaded.emailFromAddress)} />
            <StatusRow label={`SMS provider${loaded.smsProvider ? ` (${loaded.smsProvider})` : ''}`} ok={loaded.smsApiKeySet} />
          </div>
        </div>
        <p className="text-xs text-muted">Secrets are never shown here; change them in the backend .env and restart.</p>
      </Panel>
    </form>
  );
}
