import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'API reference',
  description:
    'Request and response examples for room tokens, rooms, participants, messaging and recording, plus client integration guides for web, Android, iOS and Flutter.',
  alternates: { canonical: '/docs' },
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
