import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { getPublicSite } from '@/lib/site';
import { SOCIAL_LABELS } from '@/lib/marketing';

export const metadata: Metadata = {
  title: 'Contact',
  alternates: { canonical: '/contact' },
  description: 'Email, phone, address and support hours for Nexora RTC.',
};

export default async function ContactPage() {
  const site = await getPublicSite();
  const contact = site?.contact;
  const social = site?.social;
  const socialKeys = social ? (Object.keys(SOCIAL_LABELS) as (keyof typeof SOCIAL_LABELS)[]).filter((k) => social[k]) : [];
  const hasContact = Boolean(contact && (contact.email || contact.phone || contact.whatsapp || contact.address));

  return (
    <SiteShell>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Contact</h1>

        {!hasContact || !contact ? (
          <p className="mt-6 text-muted max-w-xl">Contact details have not been published yet.</p>
        ) : (
          <address className="not-italic mt-8 grid sm:grid-cols-2 gap-x-16 gap-y-8 max-w-3xl">
            {contact.companyName && (
              <div className="sm:col-span-2">
                <p className="font-display text-2xl font-semibold">{contact.companyName}</p>
              </div>
            )}
            {contact.email && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Email</p>
                <a href={`mailto:${contact.email}`} className="mt-1 inline-block underline underline-offset-4 decoration-line hover:decoration-ink">
                  {contact.email}
                </a>
              </div>
            )}
            {contact.phone && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Phone</p>
                <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="mt-1 inline-block hover:text-accent transition-colors">
                  {contact.phone}
                </a>
              </div>
            )}
            {contact.whatsapp && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">WhatsApp</p>
                <a
                  href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block hover:text-accent transition-colors"
                >
                  {contact.whatsapp}
                </a>
              </div>
            )}
            {contact.supportHours && (
              <div>
                <p className="text-xs uppercase tracking-wider text-muted">Support hours</p>
                <p className="mt-1">{contact.supportHours}</p>
              </div>
            )}
            {contact.address && (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wider text-muted">Address</p>
                <p className="mt-1 whitespace-pre-line">{contact.address}</p>
              </div>
            )}
          </address>
        )}

        {socialKeys.length > 0 && social && (
          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {socialKeys.map((key) => (
              <a
                key={key}
                href={social[key]}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 decoration-line hover:decoration-ink"
              >
                {SOCIAL_LABELS[key]}
              </a>
            ))}
          </div>
        )}

        <section aria-labelledby="topics-heading" className="mt-14 border-t border-line pt-10 max-w-3xl">
          <h2 id="topics-heading" className="font-display text-2xl font-semibold tracking-tight">
            What to write to us about
          </h2>
          <dl className="mt-6 grid sm:grid-cols-2 gap-x-10 gap-y-6 text-sm">
            <div>
              <dt className="font-semibold">Pricing and plans</dt>
              <dd className="mt-1 text-muted leading-relaxed">Volume rates, enterprise terms, a DPA, or moving from another provider.</dd>
            </div>
            <div>
              <dt className="font-semibold">Technical help</dt>
              <dd className="mt-1 text-muted leading-relaxed">Include your project id, the room name and the time in IST so we can find the session.</dd>
            </div>
            <div>
              <dt className="font-semibold">Billing</dt>
              <dd className="mt-1 text-muted leading-relaxed">Top-ups, invoices and GST details. Quote the payment id from the receipt.</dd>
            </div>
            <div>
              <dt className="font-semibold">Security reports</dt>
              <dd className="mt-1 text-muted leading-relaxed">Send what you found and how to reproduce it. Please do not test against other customers&apos; projects.</dd>
            </div>
          </dl>
        </section>
      </div>
    </SiteShell>
  );
}
