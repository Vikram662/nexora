import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { ImageSlot, SLOT_SIZES } from '@/components/site/ImageSlot';
import { API_SURFACE, CALL_KINDS, CLIENT_PLATFORMS } from '@/lib/marketing';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Features',
  path: '/features',
  description:
    'What the Nexora API covers today: room tokens, rooms and participants, messaging, recording and signed webhooks, with the status of each.',
});

const H2 = 'text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]';

export default function FeaturesPage() {
  const ready = API_SURFACE.filter((item) => item.status === 'live');
  const testing = API_SURFACE.filter((item) => item.status === 'testing');
  const planned = API_SURFACE.filter((item) => item.status === 'planned');

  return (
    <SiteShell crumb={{ name: 'Features', path: '/features' }}>
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-12 pb-[72px] flex flex-wrap items-center gap-x-16 gap-y-10">
        <div className="flex-[1_1_420px] min-w-0 max-w-[540px]">
          <h1 className="text-[42px] sm:text-[58px] leading-[1.04] tracking-[-0.02em]">
            What it does today, and what’s still on the workbench
          </h1>
          <p className="mt-5 text-lg sm:text-[19px] leading-relaxed text-bark-soft">
            We’d rather tell you what’s ready than oversell. Everything below is called from your own server. Keys,
            storage and billing are set up in the dashboard.
          </p>
        </div>
        <ImageSlot slot="featuresHero" eager className="flex-[1_1_380px] min-h-[300px] sm:min-h-[380px]" />
      </section>

      <section aria-labelledby="ready-heading" className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-20 grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-10 gap-y-12">
          <h2 id="ready-heading" className={`${H2} col-span-full`}>
            Ready to use
          </h2>
          {ready.map((item) => (
            <article key={item.area} className="border-t-2 border-moss pt-[18px]">
              <h3 className="text-[25px]">{item.area}</h3>
              <p className="mt-2 text-base leading-relaxed text-bark-soft">{item.note}</p>
              <p className="mt-3 font-plex text-xs text-bark-muted">{item.routes.join(' · ')}</p>
            </article>
          ))}
        </div>
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-16 sm:pb-20 flex flex-wrap gap-x-10 gap-y-8">
          {testing.map((item) => (
            <div key={item.area} className="flex-[1_1_320px] rounded-[10px] bg-sand px-7 py-[26px]">
              <p className="inline-flex items-center gap-2 text-sm font-semibold text-ember">
                <span className="h-2 w-2 rounded-full bg-[#c9772f]" aria-hidden="true" />
                Being tested
              </p>
              <h3 className="mt-2.5 text-[25px]">{item.area}</h3>
              <p className="mt-2 text-base leading-relaxed text-bark-soft">{item.note}</p>
            </div>
          ))}
          {planned.map((item) => (
            <div key={item.area} className="flex-[1_1_320px] rounded-[10px] border-[1.5px] border-dashed border-taupe px-7 py-[26px]">
              <p className="text-sm font-semibold text-bark-muted">Coming later</p>
              <h3 className="mt-2.5 text-[25px]">{item.area}</h3>
              <p className="mt-2 text-base leading-relaxed text-bark-soft">{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="kinds-heading" className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px]">
        <h2 id="kinds-heading" className={`${H2} max-w-[720px]`}>
          Three kinds of call. The pass decides which, and what it costs.
        </h2>
        <div className="mt-10 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-8">
          {CALL_KINDS.map((kind, index) => (
            <article key={kind.name}>
              <ImageSlot slot={kind.image} tone={(index % 3) as 0 | 1 | 2} label="plain" sizes={SLOT_SIZES.third} className="aspect-[3/2]" />
              <h3 className="mt-[18px] text-[25px]">{kind.name}</h3>
              <p className="mt-1.5 text-base leading-relaxed text-bark-soft">{kind.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-20 flex flex-wrap gap-x-[72px] gap-y-10">
          <div className="flex-[1_1_380px] min-w-0">
            <h2 className="text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.015em]">Works in the apps you already build</h2>
            <p className="mt-3.5 text-[17px] leading-relaxed text-bark-soft">
              Your app uses the free LiveKit libraries; Nexora just hands out the passes. Step-by-step guides for each
              are in the{' '}
              <Link href="/docs" className="underline underline-offset-4 hover:text-moss">
                docs
              </Link>
              .
            </p>
            <ul className="mt-6 flex flex-wrap gap-2.5">
              {CLIENT_PLATFORMS.map((platform) => (
                <li key={platform} className="px-[18px] py-2.5 rounded-full bg-sand text-[15px]">
                  {platform}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex-[1_1_380px] min-w-0">
            <h2 className="text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.015em]">Set up in the dashboard</h2>
            <p className="mt-3.5 text-[17px] leading-[1.75] text-bark-soft">
              Projects and keys (and swapping them out), your storage bucket, where we send updates, wallet top-ups and
              GST details, your team, business KYC, call logs and recordings, the audit trail, support tickets, and
              email or SMS alerts.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
