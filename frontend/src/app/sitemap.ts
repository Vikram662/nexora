import type { MetadataRoute } from 'next';
import { PUBLIC_ROUTES, siteUrl } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${base}${route === '/' ? '' : route}`,
    changeFrequency: route === '/' || route === '/pricing' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : route === '/docs' || route === '/pricing' ? 0.8 : 0.6,
  }));
}
