'use client';

import { useEffect, useState } from 'react';
import {
  Mail,
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  BellRing,
  Info,
  Lock,
  Wallet,
  Receipt,
  FileCheck2,
  HardDrive,
  Headphones,
  Webhook,
} from 'lucide-react';
import { fetchNotificationPreferences, updateNotificationPreferences, errorMessage } from '@/lib/api';
import type { LucideIcon } from 'lucide-react';

interface AlertConfig {
  key: string;
  title: string;
  category: string;
  icon: LucideIcon;
  description: string;
  defaultEmail: boolean;
  defaultSms: boolean;
  critical: boolean;
}

const ALL_ALERTS: AlertConfig[] = [
  {
    key: 'LOW_BALANCE',
    title: 'Low Wallet Balance Alert (< ₹100)',
    category: 'Billing & Wallet',
    icon: Wallet,
    description: 'Triggered when balance falls below threshold to prevent active room disconnection.',
    defaultEmail: true,
    defaultSms: true,
    critical: true,
  },
  {
    key: 'AUTO_RECHARGE_FAILED',
    title: 'Auto-Recharge Mandate Failure',
    category: 'Billing & Wallet',
    icon: AlertCircle,
    description: 'Sent immediately when Razorpay auto-mandate fails so you can top up manually.',
    defaultEmail: true,
    defaultSms: true,
    critical: true,
  },
  {
    key: 'INVOICE_GENERATED',
    title: 'Monthly GST Tax Invoice',
    category: 'Billing & Wallet',
    icon: Receipt,
    description: 'PDF GST invoice dispatch with SAC 998314 and 18% input tax credit summary.',
    defaultEmail: true,
    defaultSms: false,
    critical: false,
  },
  {
    key: 'KYC_APPROVED',
    title: 'DigiLocker / PAN KYC Verification Status',
    category: 'Identity & Compliance',
    icon: FileCheck2,
    description: 'Confirmation alert when Income Tax / DigiLocker marks your KYC as permanently Verified.',
    defaultEmail: true,
    defaultSms: true,
    critical: false,
  },
  {
    key: 'API_KEY_ROTATED',
    title: 'Project API Secret Rotated',
    category: 'Security & Access',
    icon: Lock,
    description: 'Security notification when an API Secret is rolled, showing 24h grace window expiry.',
    defaultEmail: true,
    defaultSms: true,
    critical: true,
  },
  {
    key: 'SECURITY_ALERT',
    title: 'Suspicious IP / Rate Limit Spike',
    category: 'Security & Access',
    icon: ShieldCheck,
    description: 'Immediate alert when token generation spikes abnormally or blacklisted IPs connect.',
    defaultEmail: true,
    defaultSms: true,
    critical: true,
  },
  {
    key: 'RECORDING_COMPLETED',
    title: 'BYOS Egress Recording Uploaded',
    category: 'Media Egress',
    icon: HardDrive,
    description: 'Dispatched once room audio/video is safely uploaded to your S3, R2, or GCS bucket.',
    defaultEmail: true,
    defaultSms: false,
    critical: false,
  },
  {
    key: 'WEBHOOK_DEGRADED',
    title: 'Outbound Webhook Delivery Failures',
    category: 'Developer Webhooks',
    icon: Webhook,
    description: 'Sent after 5 consecutive failed delivery attempts to your target webhook endpoint.',
    defaultEmail: true,
    defaultSms: false,
    critical: false,
  },
  {
    key: 'TICKET_REPLY',
    title: 'Support Ticket Engineer Reply',
    category: 'Customer Support',
    icon: Headphones,
    description: 'Instant notification when an on-call WebRTC engineer replies to your inquiry.',
    defaultEmail: true,
    defaultSms: true,
    critical: false,
  },
];

export default function NotificationsPage() {
  const [, setLoading] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [criticalOnlyViaSms, setCriticalOnlyViaSms] = useState(true);
  const [successAlert, setSuccessAlert] = useState(false);

  // Granular Alert Choices (Email & SMS checkboxes per alert)
  const [alertsState, setAlertsState] = useState<Record<string, { email: boolean; sms: boolean }>>(() => {
    const initial: Record<string, { email: boolean; sms: boolean }> = {};
    ALL_ALERTS.forEach((a) => {
      initial[a.key] = { email: a.defaultEmail, sms: a.defaultSms };
    });
    return initial;
  });

  useEffect(() => {
    fetchNotificationPreferences()
      .then((pref) => {
        if (pref) {
          setEmailEnabled(pref.emailEnabled ?? true);
          setSmsEnabled(pref.smsEnabled ?? false);
          setCriticalOnlyViaSms(pref.criticalOnlyViaSms ?? true);
        }
      })
      .catch((e) => console.error('Failed to load preferences', e))
      .finally(() => setLoading(false));
  }, []);

  const handleToggle = (key: string, channel: 'email' | 'sms') => {
    setAlertsState((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [channel]: !prev[key]?.[channel],
      },
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateNotificationPreferences({
        emailEnabled,
        smsEnabled,
        criticalOnlyViaSms,
      });
      setSuccessAlert(true);
      setTimeout(() => setSuccessAlert(false), 4000);
    } catch (err) {
      alert(errorMessage(err,'Failed to save notification preferences'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-4">
        <div>
          <h2 className="font-bold text-ink text-lg flex items-center gap-2">
            <BellRing className="h-5 w-5 text-accent" />
            Email & SMS Notification Routing
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Configure automated deliverability channels for wallet balance, security alerts, and engineering events.
          </p>
        </div>

        {/* CLARITY BANNER EXPLAINING SMS vs EMAIL ROUTING */}
        <div className="p-4 rounded-md bg-accent/10 border border-accent/30 text-xs text-ink space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-ink">
            <Info className="h-4 w-4 text-accent shrink-0" />
            Alerts Delivery Clarification:
          </div>
          <p className="text-accent-deep leading-relaxed">
            <strong>Agar aap SMS Gateway ko Band (Off) karte hain:</strong> Tab bhi aapke sabhi zaroori alerts (Low Balance, Invoices, KYC, API Security) <strong>Email par 100% surakshit deliver honge</strong>. SMS band karne se alerts band nahi hote; ve bina kisi rukawat ke Email channel par chale jate hain.
          </p>
        </div>

        {successAlert && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            All notification alert routing preferences saved successfully!
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Master Channel Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {/* Master Email Toggle */}
            <div className="p-4 rounded-md bg-paper border border-line flex items-center justify-between">
              <div>
                <div className="font-bold text-ink flex items-center gap-2 text-xs">
                  <Mail className="h-4 w-4 text-accent" />
                  Master Email Channel (SMTP / Resend)
                </div>
                <p className="text-muted text-[11px] mt-0.5">
                  Sends invoices, KYC updates, and system warnings.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailEnabled}
                  onChange={(e) => setEmailEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {/* Master SMS Toggle */}
            <div className="p-4 rounded-md bg-paper border border-line flex items-center justify-between">
              <div>
                <div className="font-bold text-ink flex items-center gap-2 text-xs">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  Master SMS Gateway (MSG91 / Twilio)
                </div>
                <p className="text-muted text-[11px] mt-0.5">
                  Instant mobile SMS to registered numbers for urgent triggers.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={smsEnabled}
                  onChange={(e) => setSmsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-line peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-line after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>
          </div>

          {/* Granular Alert Event Matrix */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-ink">
                Detailed Event Alert Matrix (Customizable per Event)
              </span>
              <span className="text-[11px] text-muted font-semibold">
                Select exactly which events send Email and SMS
              </span>
            </div>

            <div className="border border-line rounded-lg overflow-hidden divide-y divide-line bg-white">
              {/* Table Header */}
              <div className="bg-paper p-3.5 text-muted text-[11px] font-bold uppercase tracking-wider flex items-center justify-between">
                <span className="w-1/2">Event Name & Description</span>
                <span className="w-1/4 text-center">Email Alert</span>
                <span className="w-1/4 text-center">SMS Alert</span>
              </div>

              {/* Table Rows */}
              {ALL_ALERTS.map((alertItem) => {
                const Icon = alertItem.icon;
                const isEmailChecked = alertsState[alertItem.key]?.email ?? true;
                const isSmsChecked = alertsState[alertItem.key]?.sms ?? false;

                return (
                  <div key={alertItem.key} className="p-4 flex items-center justify-between hover:bg-paper/60 transition-colors">
                    <div className="w-1/2 pr-4 space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-lg bg-paper-deep text-ink flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className="font-bold text-ink text-xs">{alertItem.title}</span>
                        {alertItem.critical && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-bold uppercase border border-red-200">
                            Critical
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted pl-8">{alertItem.description}</p>
                    </div>

                    {/* Email Checkbox */}
                    <div className="w-1/4 flex flex-col items-center justify-center">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailEnabled && isEmailChecked}
                          disabled={!emailEnabled}
                          onChange={() => handleToggle(alertItem.key, 'email')}
                          className="h-4 w-4 rounded text-accent border-line focus:ring-accent"
                        />
                        <span className={`text-[11px] font-semibold ${emailEnabled && isEmailChecked ? 'text-accent-deep' : 'text-slate-400'}`}>
                          {emailEnabled && isEmailChecked ? 'Active' : 'Off'}
                        </span>
                      </label>
                      {!emailEnabled && (
                        <span className="text-[9px] text-slate-400">(Email disabled)</span>
                      )}
                    </div>

                    {/* SMS Checkbox */}
                    <div className="w-1/4 flex flex-col items-center justify-center">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={smsEnabled && isSmsChecked}
                          disabled={!smsEnabled}
                          onChange={() => handleToggle(alertItem.key, 'sms')}
                          className="h-4 w-4 rounded text-emerald-600 border-line focus:ring-emerald-500"
                        />
                        <span className={`text-[11px] font-semibold ${smsEnabled && isSmsChecked ? 'text-emerald-700' : 'text-slate-400'}`}>
                          {smsEnabled && isSmsChecked ? 'Active' : 'Off'}
                        </span>
                      </label>
                      {!smsEnabled && (
                        <span className="text-[9px] text-slate-400">(SMS disabled - routes to Email)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-6 py-2.5 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs shadow-sm transition-all cursor-pointer"
            >
              Save All Notification Preferences
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
