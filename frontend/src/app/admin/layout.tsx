'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ShieldCheck, BadgeCheck, HelpCircle, Activity, CreditCard, Building2, Radio, ExternalLink, ShieldAlert, Settings } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api';

const ADMIN_NAV = [
  { href: '/admin', label: 'Admin Overview', icon: Activity, exact: true },
  { href: '/admin/billing', label: 'Billing & Revenue Reports', icon: CreditCard },
  { href: '/admin/offers', label: 'Promo Offers & Coupons', icon: Radio },
  { href: '/admin/kyc', label: 'KYC Document Review', icon: BadgeCheck },
  { href: '/admin/organizations', label: 'Organizations & Rates', icon: Building2 },
  { href: '/admin/tickets', label: 'Support Ticket Triage', icon: HelpCircle },
  { href: '/admin/audit', label: 'Master Audit & Security', icon: ShieldCheck },
  { href: '/admin/settings', label: 'Platform & Cluster Settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [staffEmail, setStaffEmail] = useState<string | null>(null);

  // Double Lock: Verify authentic staff session from backend /v1/auth/me
  useEffect(() => {
    fetch(`${getApiBaseUrl()}/v1/auth/me`, {
      credentials: 'include',
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthenticated');
        return res.json();
      })
      .then((json) => {
        if (json.data?.isStaff || json.data?.role === 'SUPER_ADMIN' || json.data?.role === 'STAFF') {
          setIsAuthorized(true);
          setStaffEmail(json.data?.email ?? null);
        } else {
          setIsAuthorized(false);
          router.replace('/user');
        }
      })
      .catch(() => {
        setIsAuthorized(false);
        router.replace('/login');
      });
  }, [pathname, router]);

  if (isAuthorized === false) {
    return (
      <div className="min-h-screen bg-console flex flex-col items-center justify-center p-4 text-center text-white">
        <ShieldAlert className="h-16 w-16 text-red-500 mb-4 animate-bounce" />
        <h1 className="text-xl font-semibold text-white">403 Forbidden - Access Denied</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm">
          You do not have staff permissions to access the Nexora Operations Center. Redirecting to Developer Console...
        </p>
      </div>
    );
  }

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper flex text-ink font-sans">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-console text-white flex flex-col justify-between hidden md:flex shrink-0 sticky top-0 h-screen">
        <div className="flex flex-col min-h-0">
          <div className="p-6 border-b border-console-line flex items-center justify-between">
            <Link href="/admin" className="block">
              <span className="font-display text-xl font-semibold tracking-tight text-paper">
                Nexora<span className="text-accent">.</span>ops
              </span>
              <div className="font-mono text-[10px] text-slate-400">Staff only</div>
            </Link>
          </div>

          <div className="p-3 mx-4 mt-4 rounded-md bg-console-line/60 border border-console-line/60 text-xs text-slate-300">
            <span className="text-[10px] text-slate-400 font-bold block">Staff Role</span>
            <span className="font-bold text-white">Super admin</span>
          </div>

          <nav className="p-4 space-y-1 overflow-y-auto flex-1 text-xs">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md font-semibold transition-all ${
                    isActive
                      ? 'bg-accent text-white'
                      : 'text-slate-400 hover:bg-console-line hover:text-white'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-console-line flex items-center justify-between">
          <div className="text-xs">
            <div className="font-bold text-white max-w-36 truncate">{staffEmail ?? 'Staff'}</div>
            <div className="text-[10px] text-slate-400">Operator</div>
          </div>
          <Link href="/user" title="Switch to User Console" className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-console-line">
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-line px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-base text-ink">
              Operations center
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-sm bg-paper-deep text-ink font-semibold border border-line">
              Staff Only
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/user" className="text-accent font-semibold hover:underline">
              Switch to user view
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
