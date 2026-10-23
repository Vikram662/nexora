import type { Metadata } from 'next';
import { SiteShell } from '@/components/site/SiteShell';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Docs',
  path: '/docs',
  description:
    'Request and response examples for room tokens, rooms, participants, messaging and recording, plus client integration guides for web, Android, iOS and Flutter.',
});

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell crumb={{ name: 'Docs', path: '/docs' }}>{children}</SiteShell>;
}
