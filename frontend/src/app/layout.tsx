import './globals.css';
import type { Metadata } from 'next';
import { Familjen_Grotesk, Figtree, IBM_Plex_Mono, Instrument_Sans, JetBrains_Mono, Newsreader } from 'next/font/google';
import { SITE_NAME, siteUrl } from '@/lib/seo';

const familjen = Familjen_Grotesk({ subsets: ['latin'], variable: '--font-familjen' });
const instrument = Instrument_Sans({ subsets: ['latin'], variable: '--font-instrument' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });
// Public site typefaces: Newsreader headings, Figtree body, Plex Mono for code and image-slot labels.
const newsreader = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], axes: ['opsz'], variable: '--font-newsreader' });
const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree' });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

const DESCRIPTION =
  'Self-hosted WebRTC control plane on LiveKit: mint room tokens, manage rooms and participants, record straight into your own S3, R2 or GCS bucket, and pay in INR with GST invoices.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'Nexora RTC | Calls, broadcast and recording API on your own media server',
    template: '%s | Nexora RTC',
  },
  description: DESCRIPTION,
  applicationName: 'Nexora RTC',
  keywords: ['WebRTC', 'LiveKit', 'video call API', 'live broadcast API', 'call recording', 'self-hosted', 'GST billing'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: 'en_IN',
    title: 'Nexora RTC | Calls, broadcast and recording API on your own media server',
    description: DESCRIPTION,
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexora RTC | Calls, broadcast and recording API on your own media server',
    description: DESCRIPTION,
  },
};

import { ToastProvider } from '@/components/ToastProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${familjen.variable} ${instrument.variable} ${jetbrains.variable} ${newsreader.variable} ${figtree.variable} ${plexMono.variable} font-sans bg-paper text-ink antialiased min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
