import { getPublicSite } from '@/lib/site';
import { breadcrumbJsonLd, jsonLdString, organizationJsonLd, websiteJsonLd, type Crumb } from '@/lib/seo';
import type { BrandSettings, PublicSite } from '@/lib/types';
import { Footer } from './Footer';
import { Header } from './Header';

const FALLBACK_BRAND: BrandSettings = { siteName: 'Nexora', tagline: '', logoUrl: '', announcement: '' };

interface SiteShellProps {
  children: React.ReactNode;
  /** The page's place under Home, emitted as BreadcrumbList structured data. Omit on the home page. */
  crumb?: Crumb;
  /** Extra structured data for this page, built from the same site settings. */
  structuredData?: (site: PublicSite | null, brand: BrandSettings) => Record<string, unknown>[];
}

export async function SiteShell({ children, crumb, structuredData }: SiteShellProps) {
  const site = await getPublicSite();
  const brand = site?.brand ?? FALLBACK_BRAND;
  const graph = [
    organizationJsonLd(site, brand),
    websiteJsonLd(brand),
    ...(crumb ? [breadcrumbJsonLd(crumb)] : []),
    ...(structuredData ? structuredData(site, brand) : []),
  ];

  return (
    <div className="site-warm flex flex-col min-h-screen">
      <Header brand={brand} />
      <main className="flex-1">{children}</main>
      <Footer brand={brand} contact={site?.contact} social={site?.social} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString({ '@context': 'https://schema.org', '@graph': graph }) }}
      />
    </div>
  );
}
