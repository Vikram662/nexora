import type { Metadata } from 'next';
import { LegalPage } from '@/components/site/LegalPage';
import { TERMS_SECTIONS } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms for using the Nexora RTC control plane: accounts, acceptable use, prepaid billing and liability.',
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      intro="These terms apply when you create an account or use the Nexora API, console or website. By using them you agree to the terms below."
      sections={TERMS_SECTIONS}
    />
  );
}
