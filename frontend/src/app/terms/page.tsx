import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { TERMS_SECTIONS } from '@/lib/legal';
import { pageMetadata } from '@/lib/seo';

export const metadata: Metadata = pageMetadata({
  title: 'Terms of service',
  path: '/terms',
  description: 'The terms for using the Nexora RTC control plane: accounts, acceptable use, prepaid billing and liability.',
});

export default function TermsPage() {
  return (
    <LegalPage
      doc="terms"
      title="Terms of service"
      intro="These terms apply when you create an account or use the Nexora API, console or website. By using them you agree to the terms below."
      sections={TERMS_SECTIONS}
    />
  );
}
