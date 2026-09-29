'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_LINKS } from '@/lib/marketing';

export function SiteNav() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-x-6 gap-y-2 text-sm overflow-x-auto">
      {NAV_LINKS.map((link) => {
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <li key={link.href} className="shrink-0">
            <Link
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'text-ink font-medium underline underline-offset-[10px] decoration-accent decoration-2'
                  : 'text-muted hover:text-ink transition-colors'
              }
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
