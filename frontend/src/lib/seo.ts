export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export const PUBLIC_ROUTES = ['/', '/features', '/pricing', '/security', '/docs', '/contact', '/privacy', '/terms'] as const;
