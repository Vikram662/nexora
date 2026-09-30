'use client';

import { useEffect, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Lock,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import {
  fetchOrganizationData,
  submitKycVerification,
  OrganizationData, errorMessage } from '@/lib/api';

export default function UserKycPage() {
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [, setLoading] = useState(true);

  // KYC States
  const [kycDocType, setKycDocType] = useState<'PAN' | 'GSTIN' | 'COMPANY_CIN' | 'AADHAAR'>('PAN');
  const [kycDocNumber, setKycDocNumber] = useState('');
  const [kycStatus, setKycStatus] = useState<string>('NOT_STARTED');
  const [kycMaskedDoc, setKycMaskedDoc] = useState<string>('');
  const [kycVerifiedAt, setKycVerifiedAt] = useState<string>('');
  const [extraGstin, setExtraGstin] = useState('');
  const [extraGstinSuccess, setExtraGstinSuccess] = useState(false);
  const [showDigilockerModal, setShowDigilockerModal] = useState(false);
  const [digilockerOtp, setDigilockerOtp] = useState('');
  const [kycError, setKycError] = useState<string | null>(null);
  const [kycSuccess, setKycSuccess] = useState(false);

  const loadData = async () => {
    try {
      const data = await fetchOrganizationData();
      setOrgData(data);
      if (data.kycVerification) {
        setKycStatus(data.kycVerification.status);
        setKycDocType(data.kycVerification.documentType);
        if (data.kycVerification.maskedDocumentNumber) {
          setKycMaskedDoc(data.kycVerification.maskedDocumentNumber);
        }
        if (data.kycVerification.reviewedAt || data.kycVerification.submittedAt) {
          setKycVerifiedAt(data.kycVerification.reviewedAt || data.kycVerification.submittedAt || '');
        }
      }
    } catch (e) {
      console.error('Failed to load KYC status', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, []);

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycError(null);
    try {
      const res = await submitKycVerification({
        documentType: kycDocType,
        documentNumber: kycDocNumber,
      });

      if (res.data.requiresOtp) {
        setKycStatus('PENDING_REVIEW');
        setShowDigilockerModal(true);
      }
    } catch (err) {
      setKycError(errorMessage(err,'KYC submission failed'));
    }
  };

  const handleVerifyDigilockerOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycError(null);
    try {
      await submitKycVerification({
        documentType: kycDocType,
        documentNumber: kycDocNumber,
        digilockerOtp,
      });

      setShowDigilockerModal(false);
      setKycStatus('VERIFIED');
      setKycSuccess(true);
      setDigilockerOtp('');
      await loadData();
      setTimeout(() => setKycSuccess(false), 4000);
    } catch (err) {
      setKycError(errorMessage(err,'DigiLocker verification failed'));
    }
  };

  const handleAddGstin = async (e: React.FormEvent) => {
    e.preventDefault();
    setKycError(null);
    try {
      await submitKycVerification({
        documentType: 'GSTIN',
        documentNumber: extraGstin,
      });
      setExtraGstinSuccess(true);
      setExtraGstin('');
      await loadData();
      setTimeout(() => setExtraGstinSuccess(false), 4000);
    } catch (err) {
      setKycError(errorMessage(err,'Failed to link GSTIN certificate'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="border-t-2 border-ink pt-5 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-ink text-lg flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-accent" />
              Business KYC & Identity Verification
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Official Indian identity authentication for production quota unlock and GST tax-compliant invoicing.
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              kycStatus === 'VERIFIED'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : kycStatus === 'PENDING_REVIEW'
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-paper-deep text-muted border border-line'
            }`}
          >
            {kycStatus === 'VERIFIED' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {kycStatus === 'PENDING_REVIEW' && <Clock className="h-3.5 w-3.5 animate-spin" />}
            {kycStatus === 'NOT_STARTED' && <AlertCircle className="h-3.5 w-3.5" />}
            Status: {kycStatus}
          </span>
        </div>

        {kycSuccess && (
          <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Document verified and permanently locked with Government DigiLocker gateway!
          </div>
        )}

        {/* SUCCESS CERTIFICATE BANNER (Shown when VERIFIED) */}
        {kycStatus === 'VERIFIED' ? (
          <div className="p-6 rounded-lg bg-console from-emerald-500/10 to-white border border-emerald-300 space-y-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-emerald-600 flex items-center justify-center text-white shadow-emerald-600/20">
                  <BadgeCheck className="h-7 w-7" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base text-ink">
                      DigiLocker Certified Organization
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-sm bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
                      <Lock className="h-3 w-3" /> Permanently Locked
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    Authenticated via National e-Governance Division (NeGD) • Govt of India
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 block">
                  DL-REF-2026-NEXORA
                </span>
                {kycVerifiedAt && (
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Verified on {new Date(kycVerifiedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Verified Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-white rounded-md border border-line shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold">Document Linked</span>
                <span className="font-bold text-ink mt-0.5 block">{kycDocType} Card</span>
              </div>

              <div className="p-3.5 bg-white rounded-md border border-line shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold">Masked Identifier</span>
                <span className="font-mono font-bold text-ink mt-0.5 block">
                  {kycMaskedDoc || (kycDocNumber ? `${kycDocNumber.substring(0, 3)}••••${kycDocNumber.slice(-2)}` : 'ABC••••1F')}
                </span>
              </div>

              <div className="p-3.5 bg-white rounded-md border border-line shadow-2xs">
                <span className="text-slate-400 block text-[10px] font-semibold">Verification Channel</span>
                <span className="font-bold text-emerald-700 mt-0.5 block flex items-center gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" /> DigiLocker Aadhaar e-Sign
                </span>
              </div>
            </div>

            {/* Production Capabilities Unlocked */}
            <div className="p-4 rounded-md bg-white border border-emerald-200/80 text-xs space-y-2">
              <span className="font-bold text-ink block flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                Production Tier Capabilities Unlocked:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted text-[11px]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Max concurrent rooms upgraded to <strong>50 rooms</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>GST Tax Invoicing & SAC Code (998314) enabled</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>LiveKit Production Keys (`pk_live_...`) activated</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>Full BYOS S3/GCS continuous egress recording allowed</span>
                </div>
              </div>
            </div>

            {/* SUPPLEMENTARY GSTIN SECTION */}
            <div className="p-4 rounded-md bg-paper border border-line text-xs space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-ink block">
                    Business GSTIN Certificate (For Tax Invoices)
                  </span>
                  <p className="text-[11px] text-muted mt-0.5">
                    PAN is permanently verified. Add your 15-digit GSTIN here if you need B2B tax credit.
                  </p>
                </div>
                {orgData?.billingProfile?.gstin ? (
                  <span className="px-2.5 py-1 rounded-sm bg-emerald-100 text-emerald-800 text-[11px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> GSTIN Active
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-sm bg-line text-ink text-[11px] font-bold">
                    Not Added
                  </span>
                )}
              </div>

              {extraGstinSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-100 border border-emerald-200 text-emerald-900 font-semibold text-xs flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" /> GSTIN successfully registered & linked to your organization!
                </div>
              )}

              {orgData?.billingProfile?.gstin ? (
                <div className="p-3 bg-white rounded-lg border border-line flex items-center justify-between font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans font-semibold">Linked GSTIN</span>
                    <span className="text-ink font-bold">{orgData.billingProfile.gstin}</span>
                  </div>
                  <span className="text-[11px] text-emerald-700 font-sans font-semibold">18% ITC Eligible</span>
                </div>
              ) : (
                <form onSubmit={handleAddGstin} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. 27ABCDE1234F1Z5"
                    value={extraGstin}
                    onChange={(e) => setExtraGstin(e.target.value.toUpperCase())}
                    maxLength={15}
                    className="flex-1 px-3 py-2 bg-white border border-line rounded-md font-mono text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    required
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs cursor-pointer transition-all"
                  >
                    Link GSTIN
                  </button>
                </form>
              )}
            </div>
          </div>
        ) : (
          /* FORM WHEN NOT YET VERIFIED */
          <form onSubmit={handleKycSubmit} className="space-y-4 max-w-xl text-xs bg-paper p-5 rounded-md border border-line">
            <div className="font-bold text-ink flex items-center justify-between">
              <span>Document Identification</span>
              <span className="text-[11px] font-semibold text-accent">DigiLocker Certified</span>
            </div>

            {kycError && (
              <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                {kycError}
              </div>
            )}

            <div>
              <label className="block font-semibold text-ink mb-1">Select Identity Document</label>
              <select
                value={kycDocType}
                onChange={(e) => setKycDocType(e.target.value as typeof kycDocType)}
                className="w-full px-3 py-2 bg-white border border-line rounded-md font-semibold"
              >
                <option value="PAN">PAN Card (e.g. ABCDE1234F)</option>
                <option value="GSTIN">GSTIN Certificate (15-digit)</option>
                <option value="COMPANY_CIN">Corporate CIN (MCA Certificate)</option>
                <option value="AADHAAR">Aadhaar Card (12-digit)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-ink">
                  {kycDocType} Number
                </label>
                <span className="text-[10px] text-slate-400">
                  {kycDocType === 'PAN' && 'Format: 5 letters + 4 digits + 1 letter'}
                  {kycDocType === 'GSTIN' && 'Format: 2-digit state + 10-char PAN + entity'}
                  {kycDocType === 'AADHAAR' && 'Format: 12 numeric digits'}
                  {kycDocType === 'COMPANY_CIN' && 'Format: 21 alphanumeric characters'}
                </span>
              </div>
              <input
                type="text"
                placeholder={
                  kycDocType === 'PAN'
                    ? 'ABCDE1234F'
                    : kycDocType === 'GSTIN'
                    ? '27ABCDE1234F1Z5'
                    : kycDocType === 'AADHAAR'
                    ? '987654321098'
                    : 'U72900MH2026PTC123456'
                }
                value={kycDocNumber}
                onChange={(e) => setKycDocNumber(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 bg-white border border-line rounded-md font-mono text-ink"
                required
              />
            </div>

            <div className="p-3 rounded-lg bg-accent/10 border border-accent/20 text-[11px] text-ink space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Government DigiLocker Consent Flow
              </div>
              <p className="text-accent-deep">
                By proceeding, you authorize Nexora to verify your document via India&apos;s DigiLocker / MCA portal. A 6-digit verification code will be requested. <strong>Once verified, this primary document is permanently locked to your organization account.</strong>
              </p>
            </div>

            <button
              type="submit"
              className="px-6 py-2.5 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <BadgeCheck className="h-4 w-4" />
              Request DigiLocker Verification
            </button>
          </form>
        )}
      </div>

      {/* DIGILOCKER OTP MODAL */}
      {showDigilockerModal && (
        <div className="fixed inset-0 bg-console/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-4 border border-line">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-xs">
                  DL
                </div>
                <span className="font-bold text-sm text-ink">DigiLocker Consent Gateway</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-accent/10 text-accent-deep font-semibold">Government of India</span>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-muted">
                A 6-digit verification code has been sent to the Aadhaar-linked mobile for document: <strong className="font-mono text-ink">{kycDocNumber}</strong>
              </p>
              <div className="p-2.5 rounded-lg bg-paper border border-line text-[11px] text-muted">
                Sandbox Test Mode OTP: <strong className="font-mono text-accent">123456</strong>
              </div>

              {kycError && (
                <div className="p-2 rounded-lg bg-red-50 text-red-700 text-[11px] font-medium">
                  {kycError}
                </div>
              )}

              <form onSubmit={handleVerifyDigilockerOtp} className="space-y-3 pt-1">
                <div>
                  <label className="block font-semibold text-ink mb-1">Enter 6-Digit OTP</label>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={digilockerOtp}
                    onChange={(e) => setDigilockerOtp(e.target.value)}
                    className="w-full px-3 py-2 bg-paper border border-line rounded-md text-center font-mono text-lg tracking-widest text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                    required
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDigilockerModal(false)}
                    className="w-1/2 py-2 bg-paper-deep hover:bg-line text-ink rounded-md font-semibold text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-1/2 py-2 bg-accent hover:bg-accent-deep text-white font-bold rounded-md text-xs cursor-pointer"
                  >
                    Confirm & Verify
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
