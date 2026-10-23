import Link from 'next/link';
import type { BrandSettings } from '@/lib/types';
import { SiteNav } from './SiteNav';
import { Wordmark } from './Wordmark';

export function Header({ brand }: { brand: BrandSettings }) {
  return (
    <header className="bg-sand text-bark">
      {brand.announcement && (
        <p role="status" className="bg-forest text-cream text-center text-sm px-6 py-2.5">
          {brand.announcement}
        </p>
      )}
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-x-9 gap-y-2.5">
        <Link href="/" aria-label={`${brand.siteName} home`} className="py-1 text-[28px] leading-none text-bark no-underline">
          <Wordmark brand={brand} />
        </Link>

        <nav aria-label="Primary" className="order-3 lg:order-2 w-full lg:w-auto lg:flex-1 min-w-0">
          <SiteNav />
        </nav>

        <div className="order-2 lg:order-3 flex items-center gap-2 text-[15px]">
          <Link href="/login" className="px-3.5 py-2.5 text-bark hover:text-moss transition-colors">
            Log in
          </Link>
          <Link
            href="/signup"
            className="px-5 py-2.5 rounded-full bg-moss text-cream font-medium hover:bg-forest transition-colors active:scale-[0.98]"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
