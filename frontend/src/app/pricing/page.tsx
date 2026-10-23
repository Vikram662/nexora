import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { Faq } from '@/components/site/Faq';
import { CostExample } from '@/components/site/CostExample';
import { getPublicSite } from '@/lib/site';
import { BILLING_FAQ, rateFormat } from '@/lib/marketing';
import type { PublicPlan } from '@/lib/types';
import { pageMetadata, softwareJsonLd } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Pricing',
  path: '/pricing',
  description: 'Per-minute rates in rupees, a prepaid wallet topped up by UPI, netbanking or card, and GST invoices every month.',
});

const WALLET_STEPS = [
  { lead: 'First,', body: 'you add money through Razorpay. All of it lands in your balance, with nothing skimmed off.' },
  { lead: 'Then,', body: 'each live call sets aside its first few minutes. When people leave, anything unused goes back.' },
  { lead: 'Each month,', body: 'you download a GST invoice (CGST+SGST or IGST) and any credit notes from the dashboard.' },
];

const isCount = (value: string) => /^\d+$/.test(value.trim());

function capacity(plan: PublicPlan) {
  if (isCount(plan.maxRooms) && isCount(plan.maxParticipants)) {
    return `Up to ${plan.maxRooms} rooms at once, ${plan.maxParticipants} people per room`;
  }
  return `Rooms at once: ${plan.maxRooms} · People per room: ${plan.maxParticipants}`;
}

function PlanCard({ plan, popular }: { plan: PublicPlan; popular: boolean }) {
  const custom = plan.videoRatePerMinute === null;
  const muted = popular ? 'text-sage' : 'text-bark-muted';

  return (
    <article className={`flex flex-col rounded-xl p-[30px] ${popular ? 'bg-forest text-sand' : 'bg-cream'}`}>
      {popular && <p className="mb-2 text-[13px] font-semibold text-sage">Most popular</p>}
      <h2 className={`text-[28px] ${popular ? 'text-cream' : ''}`}>{plan.name}</h2>
      <p className="mt-6">
        <span className={`font-serif text-5xl tracking-[-0.02em] ${popular ? 'text-cream' : ''}`}>
          {custom ? 'Let’s talk' : `₹${rateFormat.format(plan.videoRatePerMinute as number)}`}
        </span>{' '}
        {!custom && <span className={`text-[15px] ${muted}`}>per person, per minute of video</span>}
      </p>
      <ul className={`mt-[22px] mb-7 pl-[18px] list-disc text-[15px] leading-[1.9] ${popular ? 'text-[#e3ede6]' : 'text-bark-soft'}`}>
        <li>Platform fee: {plan.platformFee}</li>
        <li>{capacity(plan)}</li>
        <li>{plan.includes}</li>
      </ul>
      <Link
        href={custom ? '/contact' : '/signup'}
        className={`mt-auto self-start px-[22px] py-[13px] rounded-full font-medium transition-colors ${
          popular
            ? 'bg-cream text-forest font-semibold hover:bg-white'
            : 'border-[1.5px] border-bark hover:bg-bark hover:text-cream'
        }`}
      >
        {custom ? 'Write to us' : 'Start with this'}
      </Link>
    </article>
  );
}

export default async function PricingPage() {
  const site = await getPublicSite();
  const plans = site?.plans ?? [];
  const hasGrowth = plans.some((p) => p.tier === 'GROWTH');
  const isPopular = (plan: PublicPlan, index: number) => (hasGrowth ? plan.tier === 'GROWTH' : plans.length > 2 && index === 1);

  return (
    <SiteShell crumb={{ name: 'Pricing', path: '/pricing' }} structuredData={(s, brand) => [softwareJsonLd(s, brand)]}>
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-14 pb-12">
        <h1 className="max-w-[820px] text-[42px] sm:text-[60px] leading-[1.04] tracking-[-0.02em]">
          Pay by the minute, in rupees. Top up when you need to.
        </h1>
        <p className="mt-5 max-w-[620px] text-lg sm:text-[19px] leading-relaxed text-bark-soft">
          No monthly bill that surprises you. Add money to a wallet with UPI, netbanking or a card, and each call is
          taken from it. Testing in the sandbox is free.
        </p>
      </section>

      <section aria-label="Plans" className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-[72px]">
        {plans.length === 0 ? (
          <div className="rounded-xl bg-cream p-8">
            <p className="text-[17px] leading-relaxed text-bark-soft">
              Rates for your setup are agreed with you directly.{' '}
              <Link href="/contact" className="text-moss font-semibold underline underline-offset-4">
                Contact our engineering team
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-5 items-stretch">
            {plans.map((plan, index) => (
              <PlanCard key={plan.tier} plan={plan} popular={isPopular(plan, index)} />
            ))}
          </div>
        )}
        <p className="mt-10 max-w-[760px] text-[15px] leading-relaxed text-bark-muted">
          Prices are in rupees and don’t include GST.{' '}
          {site
            ? `${site.gstPercent}% GST (SAC ${site.sacCode}) is added to each call and shows on your monthly tax invoice.`
            : 'GST is added to each call and shows on your monthly tax invoice.'}{' '}
          Every plan lets you use your own storage and get signed updates.
        </p>
      </section>

      <section aria-labelledby="cost-heading" className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap items-center gap-x-[72px] gap-y-12">
          <div className="flex-[1_1_380px] min-w-0 max-w-[460px]">
            <h2 id="cost-heading" className="text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]">
              What does a real call cost?
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-bark-soft">
              Take a 30-minute consult: a doctor and a patient, both on video. That’s 60 person-minutes. Part-minutes
              count as a full minute.
            </p>
          </div>
          <div className="flex-[1_1_360px] min-w-0 flex justify-center">
            <CostExample site={site} variant="pricing" />
          </div>
        </div>
      </section>

      <section aria-labelledby="wallet-heading" className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px]">
        <h2 id="wallet-heading" className="text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]">
          How the wallet works
        </h2>
        <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-x-10 gap-y-8">
          {WALLET_STEPS.map((step) => (
            <div key={step.lead}>
              <p className="font-serif italic text-[34px] text-moss">{step.lead}</p>
              <p className="mt-1.5 text-[17px] leading-relaxed text-bark-soft">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <Faq items={BILLING_FAQ} heading="Money questions" />
    </SiteShell>
  );
}
