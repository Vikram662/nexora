import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { getPublicSite } from '@/lib/site';
import { BILLING_FAQ, rateFormat } from '@/lib/marketing';
import { Faq } from '@/components/site/Faq';

export const metadata: Metadata = {
  title: 'Pricing',
  alternates: { canonical: '/pricing' },
  description: 'Per-minute rates by plan, billed from a prepaid rupee wallet with a GST tax invoice for every top-up.',
};

export default async function PricingPage() {
  const site = await getPublicSite();
  const plans = site?.plans ?? [];

  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Pricing</h1>
        <p className="mt-3 text-muted max-w-xl leading-relaxed">
          Prepaid wallet in rupees.
          {site ? ` Every top-up gets a GST tax invoice under SAC ${site.sacCode}; rates below exclude ${site.gstPercent}% GST.` : ''}
        </p>

        {plans.length === 0 ? (
          <p className="mt-10 text-sm text-muted">
            Pricing is shared on request. <Link href="/contact" className="underline underline-offset-4">Get in touch</Link>.
          </p>
        ) : (
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <caption className="sr-only">Plan comparison</caption>
              <thead>
                <tr className="border-b border-ink/70 text-xs uppercase tracking-wider text-muted">
                  <th scope="col" className="py-3 pr-4 font-medium">Plan</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Platform fee</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Per video minute</th>
                  <th scope="col" className="py-3 pr-4 font-medium">Concurrent rooms</th>
                  <th scope="col" className="py-3 pr-4 font-medium">People per room</th>
                  <th scope="col" className="py-3 font-medium">Includes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {plans.map((plan) => (
                  <tr key={plan.tier}>
                    <th scope="row" className="py-4 pr-4 font-display text-lg font-semibold">
                      {plan.name}
                    </th>
                    <td className="py-4 pr-4 tabular-nums">{plan.platformFee}</td>
                    <td className="py-4 pr-4 tabular-nums">
                      {plan.videoRatePerMinute === null ? 'On request' : `₹${rateFormat.format(plan.videoRatePerMinute)}`}
                    </td>
                    <td className="py-4 pr-4 tabular-nums">{plan.maxRooms}</td>
                    <td className="py-4 pr-4 tabular-nums">{plan.maxParticipants}</td>
                    <td className="py-4 text-muted">{plan.includes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-8 text-sm text-muted max-w-2xl">
          Audio and broadcast sessions have their own per-minute rates; they are shown in the console once you sign in.
        </p>
      </div>

      <section aria-labelledby="billing-heading" className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="billing-heading" className="font-display text-3xl font-semibold tracking-tight">
            How the wallet is charged
          </h2>
          <ol className="mt-8 grid md:grid-cols-3 gap-x-10 gap-y-8 text-sm">
            <li className="border-t-2 border-ink pt-4">
              <h3 className="font-semibold">Top up</h3>
              <p className="mt-2 text-muted leading-relaxed">Add funds through Razorpay. Each successful payment is credited once and gets a GST tax invoice.</p>
            </li>
            <li className="border-t-2 border-ink pt-4">
              <h3 className="font-semibold">A token reserves the first block</h3>
              <p className="mt-2 text-muted leading-relaxed">Minting a production token deducts up to the first 10 minutes at your plan rate plus GST. If the wallet cannot cover it, the request is rejected.</p>
            </li>
            <li className="border-t-2 border-ink pt-4">
              <h3 className="font-semibold">Read it back</h3>
              <p className="mt-2 text-muted leading-relaxed">Every deduction is logged with the room, room type, rate and amount, visible under Usage in the console.</p>
            </li>
          </ol>
        </div>
      </section>

      <Faq items={BILLING_FAQ} heading="Billing questions" />
    </SiteShell>
  );
}
