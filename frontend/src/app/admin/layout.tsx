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
    <div className="min-h-screen bg-paper flex text-ink font-sans selection:bg-accent selection:text-white">
      {/* Admin Sidebar */}
      <aside className="w-64 bg-console border-r border-console-line text-white flex flex-col justify-between hidden md:flex shrink-0 sticky top-0 h-screen z-20">
        <div className="flex flex-col min-h-0">
          <div className="p-5 border-b border-white/10 flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-accent via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-accent/25 group-hover:scale-105 transition-transform">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-white block leading-none">
                  Nexora<span className="text-accent">.</span>ops
                </span>
                <span className="font-mono text-[10px] text-slate-400 uppercase tracking-widest">Control Center</span>
              </div>
            </Link>
          </div>

          <div className="p-3 mx-3 mt-3.5 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 font-semibold tracking-wider uppercase block">Staff Role</span>
              <span className="text-xs font-bold text-white flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Super Admin
              </span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-accent/20 text-white font-mono font-semibold border border-accent/30">
              STAFF
            </span>
          </div>

          <nav className="p-3 space-y-0.5 overflow-y-auto flex-1">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-accent text-white shadow-md shadow-accent/25 font-semibold'
                      : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="p-3.5 border-t border-white/10 flex items-center justify-between bg-black/20">
          <div className="text-xs min-w-0">
            <div className="font-bold text-white truncate max-w-[130px]">{staffEmail ?? 'Staff Operator'}</div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Session Authenticated</span>
            </div>
          </div>
          <Link
            href="/user"
            title="Switch to User Console"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 glass-header border-b border-line px-6 md:px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-lg md:text-xl text-ink tracking-tight">
              Platform Operations Center
            </h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold border border-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Restricted Area
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <Link
              href="/user"
              className="px-3 py-1.5 rounded-lg border border-line bg-white hover:bg-paper text-muted hover:text-ink transition-colors flex items-center gap-1.5 font-medium"
            >
              Switch to Developer View <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </header>

        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
