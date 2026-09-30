import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SiteShell } from '@/components/site/SiteShell';
import { MintDemo } from '@/components/site/MintDemo';
import { Faq } from '@/components/site/Faq';
import { getPublicSite } from '@/lib/site';
import { FAQ, HOW_IT_WORKS, USE_CASES } from '@/lib/marketing';

const ENTRY_POINTS = [
  {
    href: '/features',
    title: 'Features',
    summary: 'Tokens, rooms, participant control, messaging, recording and webhooks, with the status of each.',
  },
  {
    href: '/pricing',
    title: 'Pricing',
    summary: 'Per-minute rates by plan, billed from a prepaid rupee wallet with GST on every charge.',
  },
  {
    href: '/security',
    title: 'Data & security',
    summary: 'What lands in your bucket, what we keep, and what we do not claim.',
  },
];

const HOME_FAQ = FAQ.slice(0, 5);

export default async function HomePage() {
  const site = await getPublicSite();
  const videoRates = (site?.plans ?? []).map((p) => p.videoRatePerMinute).filter((r): r is number => r !== null);
  const lowestVideoRate = videoRates.length ? Math.min(...videoRates) : null;

  return (
    <SiteShell>
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-14 items-start">
        <div>
          <h1 className="font-display text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.04]">
            Calls, broadcasts and recordings on a media server you host.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted leading-relaxed">
            Nexora handles tokens, rooms, permissions, usage and GST billing. Media flows through your LiveKit and
            Coturn nodes, and recordings land in your own bucket, never on ours.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/docs"
              className="inline-flex items-center gap-1.5 px-5 py-3 rounded-md bg-accent text-white font-medium hover:bg-accent-deep transition-colors active:scale-[0.98]"
            >
              Open the API reference <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/user/sandbox"
              className="text-sm font-medium underline underline-offset-4 decoration-line hover:decoration-ink transition-colors"
            >
              Try a room in the sandbox
            </Link>
          </div>
        </div>

        <MintDemo ratePerMinute={lowestVideoRate} />
      </section>

      <section aria-labelledby="how-heading" className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="how-heading" className="font-display text-3xl font-semibold tracking-tight max-w-xl">
            How a session runs, start to finish
          </h2>
          <ol className="mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title} className="border-t-2 border-ink pt-4">
                <span className="font-mono text-xs text-accent">0{index + 1}</span>
                <h3 className="mt-2 font-semibold leading-snug">{step.title}</h3>
                <p className="mt-2 text-sm text-muted leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="usecase-heading" className="max-w-6xl mx-auto px-6 py-16">
        <h2 id="usecase-heading" className="font-display text-3xl font-semibold tracking-tight max-w-xl">
          What teams build with it
        </h2>
        <ul className="mt-10 grid md:grid-cols-2 gap-x-14 gap-y-10">
          {USE_CASES.map((useCase) => (
            <li key={useCase.name}>
              <h3 className="font-display text-xl font-semibold">{useCase.name}</h3>
              <p className="mt-2 text-muted leading-relaxed">{useCase.detail}</p>
              <p className="mt-3 rounded-md border border-line bg-white px-3 py-2 font-mono text-xs leading-relaxed text-ink/80">
                {useCase.recipe}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="india-heading" className="border-y border-line bg-console text-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-[1fr_1.2fr] gap-12 items-start">
          <div>
            <h2 id="india-heading" className="font-display text-3xl font-semibold tracking-tight text-paper">
              Priced and invoiced the way Indian finance teams expect
            </h2>
            <Link
              href="/pricing"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-indigo-300 underline underline-offset-4 decoration-indigo-300/40 hover:decoration-indigo-300"
            >
              See the rate table <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          <dl className="grid sm:grid-cols-2 gap-x-10 gap-y-7 text-sm">
            <div>
              <dt className="font-semibold text-paper">Prepaid rupee wallet</dt>
              <dd className="mt-1.5 text-slate-400 leading-relaxed">Top up by card, UPI or netbanking through Razorpay. No dollar conversion.</dd>
            </div>
            <div>
              <dt className="font-semibold text-paper">GST on every charge, invoiced by period</dt>
              <dd className="mt-1.5 text-slate-400 leading-relaxed">
                {site ? `Top-ups are credited in full. Each session adds ${site.gstPercent}% GST, and tax invoices under SAC ${site.sacCode} show CGST and SGST or IGST.` : 'Top-ups are credited in full. Each session adds GST, and tax invoices show CGST and SGST or IGST.'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-paper">Rates you can read</dt>
              <dd className="mt-1.5 text-slate-400 leading-relaxed">Per-minute rates come from the same table billing uses, so the price on the page is the price charged.</dd>
            </div>
            <div>
              <dt className="font-semibold text-paper">Sandbox is free</dt>
              <dd className="mt-1.5 text-slate-400 leading-relaxed">Sandbox projects are not billed, so you can build and test before funding the wallet.</dd>
            </div>
          </dl>
        </div>
      </section>

      <Faq items={HOME_FAQ} />

      <section className="border-t border-line bg-paper-deep">
        <ul className="max-w-6xl mx-auto px-6 py-14 grid md:grid-cols-3 gap-x-10 gap-y-8">
          {ENTRY_POINTS.map((entry) => (
            <li key={entry.href} className="border-t border-ink/70 pt-4">
              <Link href={entry.href} className="group inline-flex items-center gap-1.5 font-display text-xl font-semibold">
                {entry.title}
                <ArrowUpRight
                  className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </Link>
              <p className="mt-2 text-sm text-muted leading-relaxed">{entry.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 py-16 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight">Start in the sandbox</h2>
            <p className="mt-2 text-muted max-w-lg">Create an account, add a sandbox project, and join a test room from the browser before writing any code.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="px-5 py-3 rounded-md bg-ink text-paper font-medium hover:bg-accent transition-colors active:scale-[0.98]"
            >
              Create an account
            </Link>
            <Link
              href="/contact"
              className="px-5 py-3 rounded-md border border-line bg-white font-medium hover:border-ink transition-colors"
            >
              Talk to us
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
