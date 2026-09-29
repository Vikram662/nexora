import type { FaqItem } from '@/lib/marketing';

export function Faq({ items, heading = 'Questions people ask' }: { items: FaqItem[]; heading?: string }) {
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  }).replace(/</g, '\\u003c');

  return (
    <section aria-labelledby="faq-heading" className="max-w-4xl mx-auto px-6 py-16">
      <h2 id="faq-heading" className="font-display text-3xl font-semibold tracking-tight">
        {heading}
      </h2>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {items.map((item) => (
          <details key={item.q} className="group py-4">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <span aria-hidden="true" className="mt-0.5 text-accent transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </section>
  );
}
