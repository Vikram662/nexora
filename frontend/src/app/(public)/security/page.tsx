import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/site/SiteShell';
import { ImageSlot } from '@/components/site/ImageSlot';
import { SECURITY_SECTIONS } from '@/lib/marketing';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Data & security',
  path: '/security',
  description:
    'Where recordings are stored, what Nexora keeps, how bucket credentials are encrypted, and which compliance claims we do not make.',
});

const STAYS_WITH_YOU = [
  { lead: 'Sound and video.', body: 'They flow through your LiveKit and Coturn servers, never through ours.' },
  { lead: 'Recording files.', body: 'Written straight into your S3, R2 or Google Cloud bucket.' },
  { lead: 'Chat.', body: 'It travels inside the call and isn’t saved by anyone.' },
];

const WE_KEEP = [
  { lead: 'A note for each recording:', body: 'room, file name, length, size, status. Not the file.' },
  {
    lead: 'Your storage password,',
    body: 'locked with AES-256-GCM and only opened when a recording starts. It’s never shown in the browser again.',
  },
  { lead: 'The paperwork:', body: 'your account, KYC documents, wallet history, GST invoices and call logs.' },
];

const YOUR_PART = [
  'Keep your LiveKit, Coturn, recording, database and Redis servers patched.',
  'Decide who can open your recording bucket and how long files stay there.',
  'Keep project secrets on your server, never inside an app.',
  'Ask people before you record them.',
];

export default function SecurityPage() {
  return (
    <SiteShell crumb={{ name: 'Data & security', path: '/security' }}>
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-14 pb-[72px] flex flex-wrap items-center gap-x-16 gap-y-10">
        <div className="flex-[1_1_420px] min-w-0 max-w-[560px]">
          <h1 className="text-[42px] sm:text-[58px] leading-[1.04] tracking-[-0.02em]">Where your data goes. Honestly.</h1>
          <p className="mt-5 text-lg sm:text-[19px] leading-relaxed text-bark-soft">
            The calls and the recordings stay with you. Here’s the short list of what we do keep, and how we look after it.
          </p>
        </div>
        <ImageSlot slot="securityHero" eager className="flex-[1_1_360px] min-h-[300px] sm:min-h-[340px]" />
      </section>

      <section
        aria-label="What stays with you and what we keep"
        className="max-w-[1180px] mx-auto px-4 sm:px-6 pb-16 sm:pb-[88px] grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-5"
      >
        <div className="rounded-xl bg-forest text-[#e3ede6] p-8">
          <h2 className="text-[32px] text-cream">Stays with you</h2>
          <ul className="mt-[18px] pl-[18px] list-disc flex flex-col gap-2.5 text-base leading-[1.7]">
            {STAYS_WITH_YOU.map((item) => (
              <li key={item.lead}>
                <strong className="font-semibold text-cream">{item.lead}</strong> {item.body}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-cream p-8">
          <h2 className="text-[32px]">What we keep</h2>
          <ul className="mt-[18px] pl-[18px] list-disc flex flex-col gap-2.5 text-base leading-[1.7] text-bark-soft">
            {WE_KEEP.map((item) => (
              <li key={item.lead}>
                <strong className="font-semibold text-bark">{item.lead}</strong> {item.body}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="controls-heading" className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px]">
          <h2 id="controls-heading" className="max-w-[680px] text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]">
            How we look after it
          </h2>
          <div className="mt-9 grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] gap-x-12 gap-y-9">
            {SECURITY_SECTIONS.map((section) => (
              <div key={section.title}>
                <h3 className="text-[25px]">{section.title}</h3>
                <ul className="mt-3 pl-[18px] list-disc flex flex-col gap-2 text-base leading-relaxed text-bark-soft">
                  {section.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px] flex flex-wrap gap-x-[72px] gap-y-10">
        <div className="flex-[1_1_380px] min-w-0">
          <h2 className="text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.015em]">Your part of the deal</h2>
          <ul className="mt-5 pl-[18px] list-disc flex flex-col gap-2.5 text-[17px] leading-relaxed text-bark-soft">
            {YOUR_PART.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="flex-[1_1_340px] min-w-0 self-start rounded-xl bg-cream p-7">
          <h3 className="text-2xl">A straight answer on certificates</h3>
          <p className="mt-2.5 text-base leading-relaxed text-bark-soft">
            We’re working toward SOC 2 and haven’t been audited yet. If you need HIPAA or DPDP, talk to us before you rely on Nexora for it.
          </p>
          <Link href="/contact" className="inline-block mt-3 py-1.5 underline underline-offset-[5px] hover:text-moss">
            Found a security problem? Tell us
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
