import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { ImageSlot } from '@/components/site/ImageSlot';
import { getPublicSite } from '@/lib/site';
import { SOCIAL_LABELS } from '@/lib/marketing';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Contact',
  path: '/contact',
  description:
    'Email, phone, WhatsApp, office address and support hours for Nexora RTC. Write to a person about pricing, billing, bugs or security.',
});

const TOPICS = [
  { title: 'Pricing', body: 'Volume rates, enterprise terms, a DPA, or moving over from another provider.' },
  { title: 'Something’s broken', body: 'Project id, room name and the time in IST.' },
  { title: 'Billing', body: 'Top-ups, invoices and GST details. Include the payment id from your receipt.' },
  { title: 'Security', body: 'What you found and how to reproduce it. Please don’t test on other customers’ projects.' },
];

const LABEL = 'text-[13px] font-semibold text-bark-muted';
const ROW = 'py-4 border-b border-crust';

export default async function ContactPage() {
  const site = await getPublicSite();
  const contact = site?.contact;
  const social = site?.social;
  const socialKeys = social ? (Object.keys(SOCIAL_LABELS) as (keyof typeof SOCIAL_LABELS)[]).filter((k) => social[k]) : [];
  const hasContact = Boolean(contact && (contact.email || contact.phone || contact.whatsapp || contact.address || contact.supportHours));

  return (
    <SiteShell crumb={{ name: 'Contact', path: '/contact' }}>
      <section className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-14 pb-[72px] flex flex-wrap items-start gap-x-16 gap-y-10">
        <div className="flex-[1_1_380px] min-w-0">
          <ImageSlot slot="contactHero" eager className="min-h-[300px]" />
          <h1 className="mt-7 text-[42px] sm:text-[56px] leading-[1.04] tracking-[-0.02em]">Talk to a person</h1>
          <p className="mt-3.5 max-w-[440px] text-lg leading-relaxed text-bark-soft">
            Email is quickest for anything technical. Tell us your project id, the room name and roughly when it happened (IST), and we’ll
            find it.
          </p>
        </div>

        <div className="flex-[1_1_420px] min-w-0">
          {!hasContact || !contact ? (
            <p className="rounded-xl bg-cream p-7 text-bark-muted">Contact details have not been published yet.</p>
          ) : (
            <address className="not-italic rounded-xl bg-cream px-7 py-3">
              {contact.companyName && <p className={`${ROW} pt-[18px] font-serif text-[26px]`}>{contact.companyName}</p>}
              {contact.email && (
                <div className={ROW}>
                  <p className={LABEL}>Email</p>
                  <a
                    href={`mailto:${contact.email}`}
                    className="inline-block mt-1 py-0.5 text-[19px] underline underline-offset-4 break-all hover:text-moss"
                  >
                    {contact.email}
                  </a>
                </div>
              )}
              {(contact.phone || contact.whatsapp) && (
                <div className={`${ROW} flex flex-wrap gap-x-12 gap-y-4`}>
                  {contact.phone && (
                    <div>
                      <p className={LABEL}>Phone</p>
                      <a
                        href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}
                        className="inline-block mt-1 py-0.5 text-[19px] hover:text-moss"
                      >
                        {contact.phone}
                      </a>
                    </div>
                  )}
                  {contact.whatsapp && (
                    <div>
                      <p className={LABEL}>WhatsApp</p>
                      <a
                        href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-1 py-0.5 text-[19px] hover:text-moss"
                      >
                        {contact.whatsapp}
                      </a>
                    </div>
                  )}
                </div>
              )}
              {contact.supportHours && (
                <div className={ROW}>
                  <p className={LABEL}>When we’re around</p>
                  <p className="mt-1 text-[19px]">{contact.supportHours}</p>
                </div>
              )}
              {contact.address && (
                <div className={ROW}>
                  <p className={LABEL}>Office</p>
                  <p className="mt-1 text-[17px] leading-normal whitespace-pre-line">{contact.address}</p>
                </div>
              )}
              {socialKeys.length > 0 && social && (
                <p className="py-4 flex flex-wrap gap-x-[18px] gap-y-1 text-[15px]">
                  {socialKeys.map((key) => (
                    <a
                      key={key}
                      href={social[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-1 underline underline-offset-4 hover:text-moss"
                    >
                      {SOCIAL_LABELS[key]}
                    </a>
                  ))}
                </p>
              )}
            </address>
          )}
        </div>
      </section>

      <section aria-labelledby="topics-heading" className="bg-cream">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 id="topics-heading" className="text-[32px] sm:text-[40px] leading-[1.1] tracking-[-0.015em]">
            What to write to us about
          </h2>
          <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-9 gap-y-7">
            {TOPICS.map((topic) => (
              <div key={topic.title}>
                <h3 className="text-[23px]">{topic.title}</h3>
                <p className="mt-1.5 text-base leading-relaxed text-bark-soft">{topic.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
