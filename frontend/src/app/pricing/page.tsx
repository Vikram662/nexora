import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { getPublicSite } from '@/lib/site';
import { BILLING_FAQ, rateFormat } from '@/lib/marketing';
import { Faq } from '@/components/site/Faq';
import { Check, Zap, Sparkles, ArrowRight, ShieldCheck, Wallet, RefreshCw } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Pricing & Transparent Plans',
  alternates: { canonical: '/pricing' },
  description: 'Pay-as-you-go WebRTC pricing with a prepaid rupee wallet, BYOS storage, and full Indian GST compliance.',
};

export default async function PricingPage() {
  const site = await getPublicSite();
  const plans = site?.plans ?? [];

  return (
    <SiteShell>
      {/* Hero Header */}
      <section className="relative overflow-hidden pt-20 pb-16 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Prepaid Rupee Wallet • Zero Overages</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-ink">
            Predictable pricing for <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-accent to-indigo-600 bg-clip-text text-transparent">
              high-scale WebRTC
            </span>
          </h1>

          <p className="text-muted text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            Mint tokens on your own infrastructure with zero markups on video egress. Top up via UPI, NetBanking or Cards with automatic Indian GST tax invoices.
          </p>
        </div>
      </section>

      {/* Pricing Cards Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        {plans.length === 0 ? (
          <div className="p-8 text-center panel-card">
            <p className="text-sm text-muted">
              Custom enterprise pricing is customized to your cluster needs.{' '}
              <Link href="/contact" className="text-accent font-semibold hover:underline">
                Contact our engineering team
              </Link>.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {plans.map((plan, index) => {
              const isPopular = plan.tier === 'GROWTH' || index === 1;
              return (
                <div
                  key={plan.tier}
                  className={`relative flex flex-col justify-between rounded-2xl p-7 transition-all duration-200 ${
                    isPopular
                      ? 'bg-white border-2 border-accent shadow-xl shadow-accent/10 scale-100 md:-translate-y-2'
                      : 'panel-card hover:border-slate-300'
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3.5 py-0.5 rounded-full bg-accent text-white text-[11px] font-bold tracking-wide uppercase shadow-sm">
                      Most Popular
                    </div>
                  )}

                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-xl font-bold text-ink">{plan.name}</h3>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold uppercase">
                        {plan.tier}
                      </span>
                    </div>

                    {/* Price */}
                    <div className="mt-5 pb-5 border-b border-[#e2e7f0]">
                      <div className="flex items-baseline gap-1">
                        <span className="font-display text-4xl font-extrabold text-ink tracking-tight">
                          {plan.videoRatePerMinute === null
                            ? 'Custom'
                            : `₹${rateFormat.format(plan.videoRatePerMinute)}`}
                        </span>
                        {plan.videoRatePerMinute !== null && (
                          <span className="text-xs text-muted font-medium">/ video participant min</span>
                        )}
                      </div>
                      <div className="text-xs text-muted mt-1 font-medium">
                        Platform fee: <span className="font-semibold text-ink">{plan.platformFee}</span>
                      </div>
                    </div>

                    {/* Capacity Specs */}
                    <div className="py-5 space-y-3 border-b border-[#e2e7f0] text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Concurrent Rooms</span>
                        <span className="font-mono font-bold text-ink">{plan.maxRooms}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted">Max Concurrency / Room</span>
                        <span className="font-mono font-bold text-ink">{plan.maxParticipants} participants</span>
                      </div>
                    </div>

                    {/* Features List */}
                    <div className="pt-5 space-y-3">
                      <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">
                        Included Features
                      </span>
                      <ul className="space-y-2.5 text-xs text-[#334155]">
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{plan.includes}</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Customer Cloud BYOS (S3/R2/GCS direct egress)</span>
                        </li>
                        <li className="flex items-start gap-2.5">
                          <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                          <span>Signed HMAC Webhook notifications</span>
                        </li>
                        {isPopular && (
                          <li className="flex items-start gap-2.5">
                            <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>Priority TURN NAT traversal server</span>
                          </li>
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="mt-8 pt-4">
                    <Link
                      href="/signup"
                      className={`w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                        isPopular
                          ? 'bg-accent hover:bg-accent-deep text-white shadow-md shadow-accent/20'
                          : 'bg-slate-100 hover:bg-slate-200 text-ink'
                      }`}
                    >
                      Get Started with {plan.name} <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted">
          <span>Rates are in INR excluding GST. 18% GST (SAC Code 998313) is automatically itemized on monthly tax invoices.</span>
          <Link href="/user/billing" className="text-accent font-semibold hover:underline shrink-0">
            View Live Rate Card in Console →
          </Link>
        </div>
      </section>

      {/* How Wallet Works - Process Steps */}
      <section aria-labelledby="billing-heading" className="border-t border-[#e2e7f0] bg-white py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 id="billing-heading" className="font-display text-3xl font-bold tracking-tight text-ink">
              How the Prepaid Ledger Works
            </h2>
            <p className="text-muted text-sm mt-2">
              Transparent, atomic, and safe. Zero unexpected month-end surprises.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="panel-card p-6 space-y-3 relative group">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center font-bold text-sm">
                1
              </div>
              <h3 className="font-display font-bold text-base text-ink">Prepaid Top-Up</h3>
              <p className="text-xs text-muted leading-relaxed">
                Add funds securely using Razorpay (UPI, NetBanking, Cards). 100% of your payment is credited directly into your organization balance without gateway fee cuts.
              </p>
            </div>

            <div className="panel-card p-6 space-y-3 relative group">
              <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center font-bold text-sm">
                2
              </div>
              <h3 className="font-display font-bold text-base text-ink">Atomic Block Reservation</h3>
              <p className="text-xs text-muted leading-relaxed">
                Minting a production token reserves the initial block. When participants leave the room, unused minutes are refunded back to your balance automatically.
              </p>
            </div>

            <div className="panel-card p-6 space-y-3 relative group">
              <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center font-bold text-sm">
                3
              </div>
              <h3 className="font-display font-bold text-base text-ink">Compliant Tax Invoices</h3>
              <p className="text-xs text-muted leading-relaxed">
                Download gap-free monthly GST tax invoices (CGST+SGST / IGST) and credit notes directly from the console for seamless accounting and input tax credits.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <Faq items={BILLING_FAQ} heading="Frequently Asked Billing Questions" />
    </SiteShell>
  );
}

