import Link from 'next/link';
import { SiteShell } from './SiteShell';
import { getPublicSite } from '@/lib/site';
import { LEGAL_UPDATED, type LegalSection } from '@/lib/legal';

interface LegalPageProps {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export async function LegalPage({ title, intro, sections }: LegalPageProps) {
  const site = await getPublicSite();
  const contact = site?.contact;

  return (
    <SiteShell>
      <article className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {LEGAL_UPDATED}</p>
        <p className="mt-6 text-muted leading-relaxed">{intro}</p>

        <nav aria-label="On this page" className="mt-8 rounded-md border border-line bg-white p-4">
          <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {sections.map((section, index) => (
              <li key={section.heading}>
                <a href={`#s${index + 1}`} className="text-muted hover:text-accent transition-colors">
                  {index + 1}. {section.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10">
          {sections.map((section, index) => (
            <section key={section.heading} id={`s${index + 1}`} className="scroll-mt-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight">
                {index + 1}. {section.heading}
              </h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph} className="mt-3 text-muted leading-relaxed">
                  {paragraph}
                </p>
              ))}
              {section.items && (
                <ul className="mt-3 space-y-2.5 text-muted leading-relaxed">
                  {section.items.map((item) => (
                    <li key={item} className="border-l-2 border-accent/50 pl-3">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <section className="mt-14 border-t border-line pt-8 text-sm text-muted">
          <h2 className="font-display text-xl font-semibold text-ink">Contact</h2>
          {contact?.email ? (
            <p className="mt-2">
              {contact.companyName ? `${contact.companyName}: ` : ''}
              <a href={`mailto:${contact.email}`} className="text-ink underline underline-offset-4 decoration-line hover:decoration-accent">
                {contact.email}
              </a>
            </p>
          ) : (
            <p className="mt-2">
              Use the details on the{' '}
              <Link href="/contact" className="text-ink underline underline-offset-4 decoration-line hover:decoration-accent">
                contact page
              </Link>
              .
            </p>
          )}
        </section>
      </article>
    </SiteShell>
  );
}
