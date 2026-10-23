'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/marketing';

export function SiteNav() {
  const pathname = usePathname();

  return (
    <ul className="flex gap-1.5 text-[15px] overflow-x-auto">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-block px-3.5 py-2.5 rounded-full transition-colors ${
                active ? 'bg-sand-deep text-bark font-medium' : 'text-bark-muted hover:text-bark'
              }`}
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
