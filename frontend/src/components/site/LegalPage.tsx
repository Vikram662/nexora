import Link from 'next/link';
import { SiteShell } from './SiteShell';
import { getPublicSite } from '@/lib/site';
import { LEGAL_UPDATED, type LegalSection } from '@/lib/legal';

const DOCS = [
  { id: 'privacy', href: '/privacy', label: 'Privacy' },
  { id: 'terms', href: '/terms', label: 'Terms' },
] as const;

interface LegalPageProps {
  doc: (typeof DOCS)[number]['id'];
  title: string;
  intro: string;
  sections: LegalSection[];
}

export async function LegalPage({ doc, title, intro, sections }: LegalPageProps) {
  const site = await getPublicSite();
  const contact = site?.contact;

  return (
    <SiteShell crumb={{ name: title, path: `/${doc}` }}>
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-12 pb-[88px] flex flex-wrap items-start gap-x-16 gap-y-8">
        <aside className="flex-[1_1_240px] min-w-0 rounded-xl bg-cream p-[22px] lg:sticky lg:top-6">
          <nav aria-label="Legal documents" className="flex gap-1.5 p-1 rounded-full bg-sand">
            {DOCS.map((d) => (
              <Link
                key={d.id}
                href={d.href}
                aria-current={d.id === doc ? 'page' : undefined}
                className={`flex-1 min-h-10 grid place-items-center px-3 rounded-full text-sm transition-colors ${
                  d.id === doc ? 'bg-moss text-cream font-medium' : 'text-bark-soft hover:text-bark'
                }`}
              >
                {d.label}
              </Link>
            ))}
          </nav>
          <nav aria-labelledby="toc-heading">
            <p id="toc-heading" className="mt-[22px] text-[13px] font-semibold text-bark-muted">
              On this page
            </p>
            <ol className="mt-2 pl-5 list-decimal text-[15px] text-bark-muted">
              {sections.map((section, index) => (
                <li key={section.heading}>
                  <a href={`#s${index + 1}`} className="block py-[5px] text-bark hover:text-moss transition-colors">
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        <article className="flex-[999_1_600px] min-w-0 max-w-[700px]">
          <p className="text-sm text-bark-muted">Last updated {LEGAL_UPDATED}</p>
          <h1 className="mt-2.5 text-[42px] sm:text-[58px] leading-[1.04] tracking-[-0.02em]">{title}</h1>
          <p className="mt-5 font-serif text-xl sm:text-[23px] leading-normal text-bark-soft">{intro}</p>

          {sections.map((section, index) => (
            <section key={section.heading} id={`s${index + 1}`} className="mt-11 scroll-mt-6">
              <h2 className="text-[28px] tracking-[-0.01em]">
                <span className="mr-2.5 italic text-moss">{index + 1}.</span>
                {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-[17px] leading-[1.75] text-bark-soft">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 pl-[18px] list-disc space-y-2 text-[17px] leading-[1.75] text-bark-soft marker:text-moss">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="mt-14 rounded-xl bg-cream px-7 py-6 text-base text-bark-soft">
            <h2 className="text-2xl text-bark">Questions about any of this?</h2>
            {contact?.email ? (
              <p className="mt-2">
                Write to {contact.companyName || 'us'} at{' '}
                <a href={`mailto:${contact.email}`} className="text-moss underline underline-offset-4">
                  {contact.email}
                </a>
                .
              </p>
            ) : (
              <p className="mt-2">
                Use the details on the{' '}
                <Link href="/contact" className="text-moss underline underline-offset-4">
                  contact page
                </Link>
                .
              </p>
            )}
          </section>
        </article>
      </div>
    </SiteShell>
  );
}
