import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { MintDemo } from '@/components/site/MintDemo';
import { Faq } from '@/components/site/Faq';
import { ImageSlot, SLOT_SIZES } from '@/components/site/ImageSlot';
import { CostExample, lowestVideoRate } from '@/components/site/CostExample';
import { getPublicSite } from '@/lib/site';
import { FAQ, HOW_IT_WORKS, USE_CASES } from '@/lib/marketing';

const PRIMARY_CTA =
  'inline-block px-[26px] py-[15px] rounded-full bg-moss text-cream font-medium hover:bg-forest transition-colors active:scale-[0.98]';
const TEXT_LINK = 'inline-block py-2.5 underline underline-offset-[5px] hover:text-moss transition-colors';
const H2 = 'text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]';

export default async function HomePage() {
  const site = await getPublicSite();

  return (
    <SiteShell>
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-10 pb-[72px] flex flex-wrap items-center gap-x-16 gap-y-10">
        <ImageSlot slot="homeHero" eager className="flex-[1_1_460px] min-h-[320px] sm:min-h-[480px]" />
        <div className="flex-[1_1_380px] min-w-0 max-w-[500px]">
          <p className="text-[15px] font-medium text-moss">For clinics, classrooms and support teams</p>
          <h1 className="mt-3.5 text-[44px] sm:text-[62px] leading-[1.02] tracking-[-0.02em]">
            Video calls that run on servers <em className="italic">you</em> own.
          </h1>
          <p className="mt-[22px] text-lg sm:text-[19px] leading-relaxed text-bark-soft">
            Nexora takes care of the fiddly parts: who can join a room, who can speak, what it costs and the GST
            invoice at the end of the month. The calls themselves run on your own servers, and recordings go to your
            own storage.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-[22px] gap-y-3">
            <Link href="/signup" className={PRIMARY_CTA}>
              Try it free in the sandbox
            </Link>
            <Link href="/docs" className={TEXT_LINK}>
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="who-heading" className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 id="who-heading" className={`${H2} max-w-[640px]`}>
            Who uses it, and for what
          </h2>
          <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-8 gap-y-10">
            {USE_CASES.map((useCase, index) => (
              <article key={useCase.name}>
                <ImageSlot slot={useCase.image} tone={(index % 3) as 0 | 1 | 2} label="plain" sizes={SLOT_SIZES.third} className="aspect-[4/3]" />
                <h3 className="mt-5 text-[26px]">{useCase.name}</h3>
                <p className="mt-2 text-base leading-relaxed text-bark-soft">{useCase.detail}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap items-start gap-x-[72px] gap-y-12">
        <div className="flex-[1_1_400px] min-w-0">
          <h2 className={H2}>How a call happens, in plain words</h2>
          <ol className="mt-8 flex flex-col gap-[26px]">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title} className="flex gap-5">
                <span aria-hidden="true" className="min-w-7 font-serif italic text-[32px] leading-none text-moss">
                  {index + 1}
                </span>
                <p className="text-[17px] leading-relaxed text-bark-soft">
                  <strong className="font-semibold text-bark">{step.title}</strong> {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex-[1_1_420px] min-w-0">
          <MintDemo ratePerMinute={lowestVideoRate(site)} />
        </div>
      </section>

      <section className="bg-forest text-sand">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap items-end gap-x-[72px] gap-y-10">
          <p className="flex-[2_1_520px] min-w-0 font-serif text-[32px] sm:text-[46px] leading-[1.12] tracking-[-0.01em] text-cream">
            Your calls go through your servers. Your recordings sit in your storage.{' '}
            <em className="italic text-sage">We just keep the paperwork.</em>
          </p>
          <div className="flex-[1_1_300px] text-base leading-relaxed text-sage">
            <p>Chat messages aren’t saved anywhere. Storage passwords are locked away and only opened when a recording starts.</p>
            <Link href="/security" className="inline-block mt-4 py-1.5 text-cream underline underline-offset-[5px]">
              What we keep, and what we don’t
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap items-center gap-x-[72px] gap-y-12">
        <div className="flex-[1_1_380px] min-w-0 max-w-[480px]">
          <h2 className={H2}>Paid in rupees, the way your accountant likes it</h2>
          <p className="mt-[18px] text-[17px] leading-relaxed text-bark-soft">
            Top up a wallet with UPI, netbanking or a card. Each call is charged by the minute, GST is added, and you
            get a proper tax invoice. Testing in the sandbox costs nothing.
          </p>
          <Link href="/pricing" className="inline-block mt-5 py-1.5 underline underline-offset-[5px] hover:text-moss transition-colors">
            See the rates
          </Link>
        </div>
        <div className="flex-[1_1_360px] min-w-0 flex justify-center">
          <CostExample site={site} variant="home" heading="A 30-minute consult" />
        </div>
      </section>

      <Faq items={FAQ} />

      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap items-center gap-x-16 gap-y-10">
        <div className="flex-[1_1_420px] min-w-0">
          <h2 className="text-[38px] sm:text-[52px] leading-[1.04] tracking-[-0.02em]">Make a test call before you write any code.</h2>
          <p className="mt-[18px] max-w-[480px] text-lg leading-relaxed text-bark-soft">
            Create an account, add a sandbox project and join a room from your browser. If you get stuck, write to us
            and a person will answer.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-[22px] gap-y-3">
            <Link href="/signup" className={PRIMARY_CTA}>
              Create a free account
            </Link>
            <Link href="/contact" className={TEXT_LINK}>
              Talk to us first
            </Link>
          </div>
        </div>
        <ImageSlot slot="homeTeam" tone={1} className="flex-[1_1_360px] min-h-[320px]" />
      </section>
    </SiteShell>
  );
}
