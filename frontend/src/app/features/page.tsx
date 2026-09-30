import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { API_SURFACE, CLIENT_SDKS, CONSOLE_AREAS, STATUS_LABEL, STATUS_STYLE } from '@/lib/marketing';

export const metadata: Metadata = {
  title: 'Features',
  alternates: { canonical: '/features' },
  description:
    'What the Nexora API covers today: room tokens, rooms and participants, messaging, recording and signed webhooks, with the status of each.',
};

export default function FeaturesPage() {
  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-6 py-16 grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
        <div className="lg:sticky lg:top-8 self-start">
          <h1 className="font-display text-4xl font-semibold tracking-tight">What the API covers today</h1>
          <p className="mt-4 text-muted leading-relaxed">
            Calling, broadcast, messaging and recording, called from your backend. Project keys, storage buckets,
            webhook endpoints and billing are set up in the console, not through the API.
          </p>
          <p className="mt-4 text-sm text-muted">Status is shown per row so you know what you can ship against.</p>
          <Link
            href="/docs"
            className="mt-6 inline-block text-sm font-medium underline underline-offset-4 decoration-accent hover:text-accent transition-colors"
          >
            Full request and response examples
          </Link>
        </div>

        <ol className="divide-y divide-line border-y border-line">
          {API_SURFACE.map((item) => (
            <li key={item.area} className="py-6 grid sm:grid-cols-[1fr_auto] gap-x-6 gap-y-2">
              <div>
                <h2 className="font-semibold">{item.area}</h2>
                <p className="mt-1.5 text-sm text-muted leading-relaxed">{item.note}</p>
                <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ink/80">
                  {item.routes.map((route) => (
                    <span key={route}>{route}</span>
                  ))}
                </p>
              </div>
              <span
                className={`self-start justify-self-start sm:justify-self-end text-[11px] font-medium px-2 py-0.5 rounded border ${STATUS_STYLE[item.status]}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <section aria-labelledby="calltypes-heading" className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="calltypes-heading" className="font-display text-3xl font-semibold tracking-tight">
            Three kinds of session, one token endpoint
          </h2>
          <p className="mt-3 max-w-2xl text-muted leading-relaxed">
            The kind of session is decided by the grants in the token. Billing reads the same grants, so a caller cannot
            ask for a cheaper tariff than the token allows.
          </p>
          <dl className="mt-10 grid md:grid-cols-3 gap-x-10 gap-y-8">
            <div className="border-t-2 border-ink pt-4">
              <dt className="font-display text-xl font-semibold">Video call</dt>
              <dd className="mt-2 text-sm text-muted leading-relaxed">
                Default grants: publish and subscribe to camera, microphone and screen share, plus the data channel.
                Billed at the video rate.
              </dd>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <dt className="font-display text-xl font-semibold">Audio call</dt>
              <dd className="mt-2 text-sm text-muted leading-relaxed">
                Add <code className="font-mono text-xs">canPublishSources: [&quot;microphone&quot;]</code> and the participant
                cannot publish a camera or screen. Billed at the audio rate.
              </dd>
            </div>
            <div className="border-t-2 border-ink pt-4">
              <dt className="font-display text-xl font-semibold">Broadcast</dt>
              <dd className="mt-2 text-sm text-muted leading-relaxed">
                Host tokens publish; viewer tokens set <code className="font-mono text-xs">canPublish: false</code> and are billed
                at the broadcast rate. Promote a viewer to speaker later with a permissions call.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section aria-labelledby="sdk-heading" className="max-w-6xl mx-auto px-6 py-16">
        <h2 id="sdk-heading" className="font-display text-3xl font-semibold tracking-tight">
          Client apps use the LiveKit SDKs
        </h2>
        <p className="mt-3 max-w-2xl text-muted leading-relaxed">
          Nexora issues the token; the official LiveKit SDKs do the rest. Copy-paste guides for each platform are in the{' '}
          <Link href="/docs" className="underline underline-offset-4 decoration-accent hover:text-accent">
            API reference
          </Link>
          . Thin Nexora wrappers are planned, not shipped.
        </p>
        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">Supported client platforms</caption>
            <thead>
              <tr className="border-b border-ink/70 text-xs text-muted">
                <th scope="col" className="py-3 pr-4 font-medium">Platform</th>
                <th scope="col" className="py-3 pr-4 font-medium">Package</th>
                <th scope="col" className="py-3 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CLIENT_SDKS.map((sdk) => (
                <tr key={sdk.platform}>
                  <th scope="row" className="py-3.5 pr-4 font-semibold">{sdk.platform}</th>
                  <td className="py-3.5 pr-4 font-mono text-xs">{sdk.package}</td>
                  <td className="py-3.5 text-muted">{sdk.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="console-heading" className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 id="console-heading" className="font-display text-3xl font-semibold tracking-tight">
            Set up in the console, not through the API
          </h2>
          <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-3 text-sm text-muted">
            {CONSOLE_AREAS.map((item) => (
              <li key={item} className="border-l-2 border-accent/50 pl-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </SiteShell>
  );
}
