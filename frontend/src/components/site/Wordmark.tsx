import type { BrandSettings } from '@/lib/types';

export function Wordmark({ brand, className }: { brand: BrandSettings; className?: string }) {
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={brand.logoUrl} alt={brand.siteName} className={`h-8 w-auto ${className ?? ''}`} />;
  }
  return <span className={`font-serif font-medium tracking-[-0.01em] ${className ?? ''}`}>{brand.siteName}</span>;
}
