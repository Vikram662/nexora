import type { Metadata } from 'next';
import type { BrandSettings, PublicSite } from './types';

export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export const PUBLIC_ROUTES = ['/', '/features', '/pricing', '/security', '/docs', '/contact', '/privacy', '/terms'] as const;

export const SITE_NAME = 'Nexora RTC';

interface PageMetaInput {
  /** Short page title; the root layout's template appends "| Nexora RTC". */
  title: string;
  description: string;
  path: (typeof PUBLIC_ROUTES)[number];
}

/**
 * Title, description, canonical and social tags for one public page. Next merges metadata shallowly,
 * so a page that omits `openGraph` would share with the home page's title and URL.
 */
export function pageMetadata({ title, description, path }: PageMetaInput): Metadata {
  const shareTitle = `${title} | ${SITE_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_IN', title: shareTitle, description, url: path },
    twitter: { card: 'summary_large_image', title: shareTitle, description },
  };
}

type JsonLd = Record<string, unknown>;

/** Serialise for a <script type="application/ld+json">, escaping `<` so content cannot close the tag. */
export function jsonLdString(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function organizationJsonLd(site: PublicSite | null, brand: BrandSettings): JsonLd {
  const contact = site?.contact;
  const social = site?.social;
  const sameAs = social ? [social.linkedin, social.twitter, social.github, social.youtube].filter(Boolean) : [];
  return {
    '@type': 'Organization',
    '@id': `${siteUrl()}/#organization`,
    name: contact?.companyName || brand.siteName,
    url: siteUrl(),
    ...(brand.logoUrl ? { logo: brand.logoUrl } : {}),
    ...(sameAs.length ? { sameAs } : {}),
    ...(contact?.address ? { address: contact.address } : {}),
    ...(contact?.email || contact?.phone
      ? {
          contactPoint: [
            {
              '@type': 'ContactPoint',
              contactType: 'customer support',
              areaServed: 'IN',
              ...(contact.email ? { email: contact.email } : {}),
              ...(contact.phone ? { telephone: contact.phone } : {}),
              ...(contact.supportHours ? { hoursAvailable: contact.supportHours } : {}),
            },
          ],
        }
      : {}),
  };
}

export function websiteJsonLd(brand: BrandSettings): JsonLd {
  return {
    '@type': 'WebSite',
    '@id': `${siteUrl()}/#website`,
    name: brand.siteName,
    url: siteUrl(),
    inLanguage: 'en-IN',
    publisher: { '@id': `${siteUrl()}/#organization` },
  };
}

export interface Crumb {
  name: string;
  path: string;
}

export function breadcrumbJsonLd(crumb: Crumb): JsonLd {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl() },
      { '@type': 'ListItem', position: 2, name: crumb.name, item: `${siteUrl()}${crumb.path}` },
    ],
  };
}

/** The product with one offer per published plan rate (per participant-minute of video, excluding GST). */
export function softwareJsonLd(site: PublicSite | null, brand: BrandSettings): JsonLd {
  const offers = (site?.plans ?? [])
    .filter((plan) => plan.videoRatePerMinute !== null)
    .map((plan) => ({
      '@type': 'Offer',
      name: `${plan.name} plan`,
      url: `${siteUrl()}/pricing`,
      priceCurrency: 'INR',
      price: plan.videoRatePerMinute,
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: plan.videoRatePerMinute,
        priceCurrency: 'INR',
        unitText: 'per participant-minute of video',
        valueAddedTaxIncluded: false,
      },
    }));

  return {
    '@type': 'SoftwareApplication',
    name: brand.siteName,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'Web, Android, iOS',
    description:
      'A control plane for self-hosted LiveKit video, voice and broadcast calls: room passes, room control, signed webhooks, recording to your own bucket, and prepaid billing in rupees with GST invoices.',
    url: siteUrl(),
    publisher: { '@id': `${siteUrl()}/#organization` },
    ...(offers.length ? { offers } : {}),
  };
}
