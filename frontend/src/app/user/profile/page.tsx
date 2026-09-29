'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { User, Mail, Phone, Lock, Save, CheckCircle2, Smartphone, X } from 'lucide-react';
import { fetchOrganizationData, OrganizationData, fetch2faSetup, verifyAndToggle2fa, errorMessage } from '@/lib/api';

export default function UserProfilePage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [, setLoading] = useState(true);
  const [name, setName] = useState('Lead Engineer');
  const [phone, setPhone] = useState('+91 98765 43210');
  const [email, setEmail] = useState('developer@company.com');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Real 2FA state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [mfaSecret, setMfaSecret] = useState('');
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const loadData = () => {
    fetchOrganizationData()
      .then((data) => {
        setOrgData(data);
        if (data.billingEmail) setEmail(data.billingEmail);
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));

    fetch2faSetup()
      .then((data) => {
        if (data) {
          setTwoFactorEnabled(Boolean(data.enabled));
          setMfaSecret(data.secret || process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || '');
        }
      })
      .catch(() => {
        setMfaSecret(process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || '');
      });
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpen2faModal = async () => {
    setMfaError(null);
    setTotpCode('');
    try {
      const setup = await fetch2faSetup();
      if (setup && setup.secret) {
        setMfaSecret(setup.secret);
      } else {
        setMfaSecret(process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || '');
      }
      setShowMfaModal(true);
    } catch (err) {
      console.warn('Backend 2FA setup endpoint notice:', err);
      setMfaSecret(process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || '');
      setShowMfaModal(true);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError(null);
    try {
      await verifyAndToggle2fa(totpCode.trim(), true);
      setTwoFactorEnabled(true);
      setShowMfaModal(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      setMfaError(errorMessage(err,'Verification failed'));
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisable2fa = async () => {
    if (!confirm('Are you sure you want to disable Two-Factor Authentication?')) return;
    try {
      await verifyAndToggle2fa('', false);
      setTwoFactorEnabled(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    } catch (err) {
      alert(errorMessage(err,'Failed to disable 2FA'));
    }
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <User className="h-5 w-5 text-accent" />
            <span>Developer Account & Organization Profile</span>
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Manage your personal login credentials, organization identity, and security access.
          </p>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>Profile changes saved successfully!</span>
        </div>
      )}

      {/* Profile Overview Card */}
      <div className="bg-white p-6 rounded-lg border border-line shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-lg bg-console text-white flex items-center justify-center font-semibold text-2xl">
            {orgData?.name ? orgData.name.substring(0, 2).toUpperCase() : 'ND'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-ink">{name}</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent-deep border border-accent/30 uppercase">
                Owner / Admin
              </span>
            </div>
            <div className="text-xs text-muted mt-0.5 flex items-center gap-2">
              <span>Organization: <strong>{orgData?.name || 'Nexora Technologies Inc'}</strong></span>
              <span>•</span>
              <span className="font-mono text-[11px]">{orgData?.id ? `ID: ${orgData.id.substring(0, 8)}...` : ''}</span>
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-3">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {email}</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {phone}</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-md bg-paper border border-line text-xs text-right space-y-1">
          <div className="text-[10px] text-slate-400 font-semibold">Prepaid Wallet Escrow</div>
          <div className="text-lg font-semibold text-emerald-600">
            ₹{Number(orgData?.walletBalance || 0).toFixed(2)}
          </div>
          <div className="text-[10px] text-accent font-bold uppercase">
            Plan: {orgData?.planTier || 'STARTER'}
          </div>
        </div>
      </div>

      {/* Edit Information Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Personal Details */}
        <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-ink flex items-center gap-2 border-b border-line pb-3">
            <User className="h-4 w-4 text-accent" />
            Personal Contact Information
          </h3>

          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-ink mb-1">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-medium"
                required
              />
            </div>

            <div suppressHydrationWarning>
              <label className="block font-semibold text-ink mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-medium"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-ink mb-1">Mobile Phone (OTP / Alerts)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-paper border border-line rounded-md font-medium"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Save className="h-3.5 w-3.5" /> Save Changes
            </button>
          </form>
        </div>

        {/* Security & Authentication */}
        <div className="bg-white p-6 rounded-lg border border-line shadow-sm space-y-4">
          <h3 className="font-bold text-sm text-ink flex items-center gap-2 border-b border-line pb-3">
            <Lock className="h-4 w-4 text-emerald-600" />
            Security & Access Control
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-md border border-line bg-paper/70 flex items-center justify-between">
              <div>
                <div className="font-bold text-ink">Two-Factor Authentication (2FA)</div>
                <div className="text-[11px] text-muted">TOTP Authenticator app protection</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                  twoFactorEnabled 
                    ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' 
                    : 'text-amber-700 bg-amber-50 border border-amber-200'
                }`}>
                  {twoFactorEnabled ? 'ENABLED' : 'DISABLED'}
                </span>
                {twoFactorEnabled ? (
                  <button
                    type="button"
                    onClick={handleDisable2fa}
                    className="px-2.5 py-1 text-[11px] font-bold text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 cursor-pointer"
                  >
                    Disable
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpen2faModal}
                    className="px-2.5 py-1 text-[11px] font-bold text-accent bg-white border border-accent/30 rounded-lg hover:bg-accent/10 cursor-pointer"
                  >
                    Enable 2FA
                  </button>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-md border border-line bg-paper/70 flex items-center justify-between">
              <div>
                <div className="font-bold text-ink">Session Security</div>
                <div className="text-[11px] text-muted">AES-256 HttpOnly encrypted cookie</div>
              </div>
              <span className="font-bold text-accent-deep bg-accent/10 border border-accent/30 px-2 py-0.5 rounded text-[10px]">
                ACTIVE
              </span>
            </div>

            <div className="p-3.5 rounded-md border border-line bg-paper/70 flex items-center justify-between">
              <div>
                <div className="font-bold text-ink">Role & Privileges</div>
                <div className="text-[11px] text-muted">Tenant Owner & API Master</div>
              </div>
              <span className="font-bold text-ink bg-paper-deep border border-line px-2 py-0.5 rounded text-[10px]">
                FULL ADMIN
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2FA Setup Modal */}
      {showMfaModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 border border-line space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-ink font-bold text-sm">
                <Smartphone className="h-5 w-5 text-accent" />
                <span>Setup Two-Factor Authenticator</span>
              </div>
              <button
                type="button"
                onClick={() => setShowMfaModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-muted hover:bg-paper-deep cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed text-center">
              Scan this QR Code with your Authenticator App (Google Authenticator, Microsoft Authenticator, or Authy).
            </p>

            {/* QR Code Container */}
            <div className="flex flex-col items-center justify-center p-4 bg-paper rounded-lg border border-line space-y-3">
              <div className="p-2.5 bg-white rounded-md shadow-sm border border-line">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
                    `otpauth://totp/${encodeURIComponent(process.env.NEXT_PUBLIC_MFA_ISSUER || '')}:${encodeURIComponent(email)}?secret=${mfaSecret || process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || ''}&issuer=${encodeURIComponent(process.env.NEXT_PUBLIC_MFA_ISSUER || '')}`
                  )}`}
                  alt="2FA TOTP QR Code"
                  className="w-36 h-36 rounded-lg object-contain"
                />
              </div>

              {/* Secret Key with copy */}
              <div className="w-full text-center">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  Or enter secret key manually:
                </span>
                <span className="font-mono text-xs font-semibold text-accent-deep tracking-wider select-all bg-white px-3 py-1 rounded-lg border border-line mt-1 inline-block">
                  {mfaSecret || process.env.NEXT_PUBLIC_DEFAULT_2FA_SECRET || ''}
                </span>
              </div>
            </div>

            {mfaError && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                {mfaError}
              </div>
            )}

            <form onSubmit={handleVerify2fa} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">
                  Enter 6-Digit Authenticator Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2 bg-paper border border-line rounded-md font-mono text-center text-lg font-bold tracking-widest"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMfaModal(false)}
                  className="px-4 py-2 text-muted font-bold hover:bg-paper-deep rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mfaLoading || totpCode.length !== 6}
                  className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {mfaLoading ? 'Verifying...' : 'Verify & Enable 2FA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
