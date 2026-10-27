import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { PRIVACY_SECTIONS } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Privacy policy',
  path: '/privacy',
  description: 'What personal data Nexora RTC collects, what it deliberately does not, and how to exercise your rights.',
});

export default function PrivacyPage() {
  return (
    <LegalPage
      doc="privacy"
      title="Privacy policy"
      intro="We keep the personal data we hold to what is needed to run accounts, meter usage and bill in rupees. Call media, chat content and recording files are not part of it."
      sections={PRIVACY_SECTIONS}
    />
  );
}
