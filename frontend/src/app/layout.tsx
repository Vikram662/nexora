import './globals.css';
import type { Metadata } from 'next';
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from 'next/font/google';
import Script from 'next/script';
import { siteUrl } from '@/lib/seo';

const bricolage = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-bricolage' });
const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' });

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
    siteName: 'Nexora RTC',
    title: 'Nexora RTC | Calls, broadcast and recording API on your own media server',
    description: DESCRIPTION,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: 'Nexora RTC', description: DESCRIPTION },
};

import { ToastProvider } from '@/components/ToastProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <head>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      </head>
      <body
        className={`${bricolage.variable} ${dmSans.variable} ${jetbrains.variable} font-sans bg-paper text-ink antialiased min-h-screen flex flex-col`}
        suppressHydrationWarning
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
