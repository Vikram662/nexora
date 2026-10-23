import type { FaqItem } from '@/lib/marketing';
import { jsonLdString } from '@/lib/seo';

export function Faq({ items, heading = 'Questions we get a lot' }: { items: FaqItem[]; heading?: string }) {
  const jsonLd = jsonLdString({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  });

  return (
    <section aria-labelledby="faq-heading" className="bg-cream">
      <div className="max-w-[820px] mx-auto px-4 sm:px-6 py-16 sm:py-[88px]">
        <h2 id="faq-heading" className="text-[34px] sm:text-[44px] leading-[1.08] tracking-[-0.015em]">
          {heading}
        </h2>
        <div className="mt-7 border-b border-crust">
          {items.map((item, index) => (
            <details key={item.q} open={index === 0} className="group py-5 border-t border-crust">
              <summary className="flex cursor-pointer items-start justify-between gap-6 py-1 text-[19px] font-medium">
                <span>{item.q}</span>
                <span aria-hidden="true" className="mt-0.5 text-moss transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2.5 text-base leading-[1.65] text-bark-soft">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </section>
  );
}
