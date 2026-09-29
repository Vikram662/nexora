import Link from 'next/link';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { getPublicSite } from '@/lib/site';
import { FOOTER_GROUPS, SOCIAL_LABELS } from '@/lib/marketing';
import { siteUrl } from '@/lib/seo';
import type { BrandSettings, PublicSite } from '@/lib/types';
import { SiteNav } from './SiteNav';
import { SocialIcon } from './SocialIcon';
import { Wordmark } from './Wordmark';

const FALLBACK_BRAND: BrandSettings = { siteName: 'Nexora', tagline: '', logoUrl: '', announcement: '' };
const DEFAULT_TAGLINE = 'A control plane for teams that would rather run their own media servers.';

type SocialKey = keyof typeof SOCIAL_LABELS;

function organizationJsonLd(site: PublicSite | null, brand: BrandSettings, sameAs: string[]) {
  const contact = site?.contact;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: contact?.companyName || brand.siteName,
    url: siteUrl(),
    ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(contact?.email || contact?.phone
      ? {
          contactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              ...(contact.email ? { email: contact.email } : {}),
              ...(contact.phone ? { telephone: contact.phone } : {}),
              ...(contact.supportHours ? { hoursAvailable: contact.supportHours } : {}),
            },
          ],
        }
      : {}),
  };
}

export async function SiteShell({ children }: { children: React.ReactNode }) {
  const site = await getPublicSite();
  const brand = site?.brand ?? FALLBACK_BRAND;
  const contact = site?.contact;
  const social = site?.social;
  const socialKeys = social ? (Object.keys(SOCIAL_LABELS) as SocialKey[]).filter((k) => social[k]) : [];
  const sameAs = social ? socialKeys.map((k) => social[k]) : [];
  const jsonLd = JSON.stringify(organizationJsonLd(site, brand, sameAs)).replace(/</g, '\\u003c');

  return (
    <div className="flex flex-col min-h-screen selection:bg-accent selection:text-white">
      {brand.announcement && (
        <p role="status" className="bg-ink text-paper text-center text-sm px-6 py-2">
          {brand.announcement}
        </p>
      )}

      <header className="border-b border-line">
        <div className="max-w-6xl mx-auto px-6 min-h-16 py-3 flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
          <Link href="/" aria-label={`${brand.siteName} home`} className="text-xl">
            <Wordmark brand={brand} />
          </Link>

          <nav aria-label="Primary" className="order-3 md:order-2 w-full md:w-auto">
            <SiteNav />
          </nav>

          <div className="order-2 md:order-3 flex items-center gap-2 text-sm">
            <Link href="/login" className="px-3 py-2 text-muted hover:text-ink transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-md bg-ink text-paper font-medium hover:bg-accent transition-colors active:scale-[0.98]"
            >
              Create an account
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line bg-paper-deep">
        <div className="max-w-6xl mx-auto px-6 py-14 grid gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_0.7fr_0.7fr_1.2fr] text-sm text-muted">
          <section aria-label="About">
            <p className="text-xl text-ink">
              <Wordmark brand={brand} />
            </p>
            <p className="mt-3 max-w-xs leading-relaxed">{brand.tagline || DEFAULT_TAGLINE}</p>

            {socialKeys.length > 0 && social && (
              <ul className="mt-5 flex gap-2" aria-label="Social profiles">
                {socialKeys.map((key) => (
                  <li key={key}>
                    <a
                      href={social[key]}
                      target="_blank"
                      rel="noopener noreferrer me"
                     
                      aria-label={`${brand.siteName} on ${SOCIAL_LABELS[key]}`}
                      className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-ink hover:border-accent hover:text-accent transition-colors"
                    >
                      <SocialIcon network={key} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {FOOTER_GROUPS.map((group) => (
            <nav key={group.heading} aria-label={group.heading}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">{group.heading}</h2>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="hover:text-ink transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <section aria-label="Contact">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">Contact</h2>
            <address className="not-italic mt-4 space-y-3">
              {contact?.companyName && (
                <p className="text-ink font-medium">
                  {contact.companyName}
                </p>
              )}
              {contact?.address && (
                <p className="flex gap-2.5">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span className="whitespace-pre-line">{contact.address}</span>
                </p>
              )}
              {contact?.email && (
                <p className="flex gap-2.5">
                  <Mail className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <a href={`mailto:${contact.email}`} className="hover:text-ink transition-colors break-all">
                    {contact.email}
                  </a>
                </p>
              )}
              {contact?.phone && (
                <p className="flex gap-2.5">
                  <Phone className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`} className="hover:text-ink transition-colors">
                    {contact.phone}
                  </a>
                </p>
              )}
              {contact?.whatsapp && (
                <p className="flex gap-2.5">
                  <MessageCircle className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <a
                    href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-ink transition-colors"
                  >
                    WhatsApp {contact.whatsapp}
                  </a>
                </p>
              )}
              {contact?.supportHours && (
                <p className="flex gap-2.5">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                  <span>{contact.supportHours}</span>
                </p>
              )}
              <p>
                <Link href="/contact" className="text-ink underline underline-offset-4 decoration-line hover:decoration-accent">
                  All contact details
                </Link>
              </p>
            </address>
          </section>
        </div>

        <div className="border-t border-line">
          <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
            <p>
              © {new Date().getFullYear()} {contact?.companyName || brand.siteName}. All rights reserved.
            </p>
            <p>Media on your servers · Recordings in your bucket · Billed in INR</p>
          </div>
        </div>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </div>
  );
}
