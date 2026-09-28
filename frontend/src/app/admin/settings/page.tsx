'use client';

import { useEffect, useState } from 'react';
import {
  Settings,
  Server,
  DollarSign,
  ShieldCheck,
  Save,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  Cpu,
  Radio,
  CreditCard,
  Mail,
  MessageSquare,
} from 'lucide-react';
import { fetchAdminSettings, updateAdminSettings } from '@/lib/api';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<any>({
    platformName: 'Nexora RTC Enterprise',
    defaultMinuteRate: 0.0035,
    defaultCurrency: 'INR',
    sacCode: '998314',
    defaultGstPercent: 18,
    livekitHost: 'http://localhost:7880',
    coturnHost: 'localhost:3478',
    mfaEnforcedForStaff: true,
    maxRoomsPerOrg: 50,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminSettings();
      if (res.data) setSettings(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateAdminSettings(settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <span>Platform & Cluster Settings</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure default billing parameters, statutory GST compliance rules, SFU nodes, and security policies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-indigo-600/20 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Platform Rules'}
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Platform cluster settings and GST billing configurations updated successfully!</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: GST & Financial Rules */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <DollarSign className="h-4 w-4 text-emerald-600" />
            <span>Platform Legal Entity & Statutory GST Profile</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Company Legal Registered Name</label>
              <input
                type="text"
                value={settings.companyLegalName || ''}
                onChange={(e) => setSettings({ ...settings, companyLegalName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company GSTIN</label>
                <input
                  type="text"
                  maxLength={15}
                  value={settings.companyGstin || ''}
                  onChange={(e) => setSettings({ ...settings, companyGstin: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Permanent PAN</label>
                <input
                  type="text"
                  maxLength={10}
                  value={settings.companyPan || ''}
                  onChange={(e) => setSettings({ ...settings, companyPan: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Registered State (POS)</label>
                <input
                  type="text"
                  value={settings.companyState || ''}
                  onChange={(e) => setSettings({ ...settings, companyState: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Pincode</label>
                <input
                  type="text"
                  maxLength={6}
                  value={settings.companyPincode || ''}
                  onChange={(e) => setSettings({ ...settings, companyPincode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SAC Code</label>
                <input
                  type="text"
                  value={settings.sacCode}
                  onChange={(e) => setSettings({ ...settings, sacCode: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">GST Rate (%)</label>
                <input
                  type="number"
                  value={settings.defaultGstPercent}
                  onChange={(e) => setSettings({ ...settings, defaultGstPercent: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Rate / Min (₹)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={settings.defaultMinuteRate}
                  onChange={(e) => setSettings({ ...settings, defaultMinuteRate: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  required
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: SFU Cluster & Gateway Hosts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Server className="h-4 w-4 text-indigo-600" />
            <span>WebRTC SFU & Coturn Cluster</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                LiveKit SFU Server URL
              </label>
              <input
                type="text"
                value={settings.livekitHost}
                onChange={(e) => setSettings({ ...settings, livekitHost: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Coturn STUN / TURN Host:Port
              </label>
              <input
                type="text"
                value={settings.coturnHost}
                onChange={(e) => setSettings({ ...settings, coturnHost: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Default Max Rooms per Organization
              </label>
              <input
                type="number"
                value={settings.maxRoomsPerOrg}
                onChange={(e) => setSettings({ ...settings, maxRoomsPerOrg: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 3: Razorpay Payment Gateway */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <CreditCard className="h-4 w-4 text-indigo-600" />
            <span>Razorpay Payment Gateway Integration</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Razorpay Key ID</label>
              <input
                type="text"
                value={settings.razorpayKeyId || ''}
                onChange={(e) => setSettings({ ...settings, razorpayKeyId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                placeholder="rzp_live_... or rzp_test_..."
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Razorpay Key Secret</label>
              <input
                type="password"
                value={settings.razorpayKeySecret || ''}
                onChange={(e) => setSettings({ ...settings, razorpayKeySecret: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                placeholder="Key Secret from Razorpay Dashboard"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Webhook Secret (payment.captured)</label>
              <input
                type="text"
                value={settings.razorpayWebhookSecret || ''}
                onChange={(e) => setSettings({ ...settings, razorpayWebhookSecret: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-[11px]"
                placeholder="whsec_..."
              />
            </div>
          </div>
        </div>

        {/* Section 4: Email SMTP / Transactional Dispatch */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Mail className="h-4 w-4 text-blue-600" />
            <span>Email Dispatch (Invoices & Low Balance Alerts)</span>
          </h2>

          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SMTP Host</label>
                <input
                  type="text"
                  value={settings.smtpHost || ''}
                  onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  placeholder="smtp.sendgrid.net"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SMTP Port</label>
                <input
                  type="number"
                  value={settings.smtpPort || 587}
                  onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SMTP Username</label>
                <input
                  type="text"
                  value={settings.smtpUser || ''}
                  onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  placeholder="apikey / username"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">SMTP Password</label>
                <input
                  type="password"
                  value={settings.smtpPassword || ''}
                  onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                  placeholder="Password or API Key"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sender Email From Address</label>
              <input
                type="email"
                value={settings.emailFromAddress || ''}
                onChange={(e) => setSettings({ ...settings, emailFromAddress: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                placeholder="billing@nexora.io"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 5: SMS Gateway (Fast2SMS / Twilio / Msg91) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 md:col-span-2">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <MessageSquare className="h-4 w-4 text-emerald-600" />
            <span>SMS Gateway Integration (Critical Alerts & OTPs)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">SMS Provider</label>
              <select
                value={settings.smsProvider || 'FAST2SMS'}
                onChange={(e) => setSettings({ ...settings, smsProvider: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="FAST2SMS">Fast2SMS (India DLT Compliant)</option>
                <option value="TWILIO">Twilio SMS Global</option>
                <option value="MSG91">MSG91 India</option>
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Sender ID (DLT Header)</label>
              <input
                type="text"
                maxLength={6}
                value={settings.smsSenderId || ''}
                onChange={(e) => setSettings({ ...settings, smsSenderId: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono uppercase font-bold"
                placeholder="NEXORA"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">SMS Gateway API Key / Auth Token</label>
              <input
                type="password"
                value={settings.smsApiKey || ''}
                onChange={(e) => setSettings({ ...settings, smsApiKey: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                placeholder="API Key from SMS provider dashboard"
                required
              />
            </div>
          </div>
        </div>

        {/* Section 6: Staff Security Policies */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4 md:col-span-2">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <span>Staff Administration Security Policy</span>
          </h2>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <div className="text-xs font-bold text-slate-900">Enforce Mandatory 2FA for Staff Logins</div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Staff accounts with role ADMIN must verify 6-digit TOTP token to enter the master console.
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.mfaEnforcedForStaff}
                onChange={(e) => setSettings({ ...settings, mfaEnforcedForStaff: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </form>
    </div>
  );
}
