'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Key,
  Video,
  HardDrive,
  Flame,
  BellRing,
  Clock,
  BadgeCheck,
  Users2,
  ShieldCheck,
  HelpCircle,
  Mail,
  CreditCard,
  Activity,
  LogOut,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { fetchOrganizationData, OrganizationData, getApiBaseUrl } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/user', label: 'Overview & Metrics', icon: Activity, exact: true },
  { href: '/user/projects', label: 'Projects & API Keys', icon: Key },
  { href: '/user/sandbox', label: 'Interactive RTC Sandbox', icon: Video },
  { href: '/docs', label: 'API & SDK Documentation', icon: BookOpen, badgeColor: 'text-accent' },
  { href: '/user/storage', label: 'BYOS Storage (S3/R2/GCS)', icon: HardDrive },
  { href: '/user/firebase', label: 'BYOF Firebase (Call Push)', icon: Flame, badgeColor: 'text-amber-500' },
  { href: '/user/webhooks', label: 'Outbound Webhooks', icon: BellRing },
  { href: '/user/usage', label: 'Usage & Recordings', icon: Clock },
  { href: '/user/kyc', label: 'Business KYC Verification', icon: BadgeCheck, badgeColor: 'text-accent' },
  { href: '/user/team', label: 'Team & RBAC', icon: Users2 },
  { href: '/user/audit', label: 'Zero-Storage Audit Trail', icon: ShieldCheck, badgeColor: 'text-emerald-600' },
  { href: '/user/tickets', label: 'Support & Tickets', icon: HelpCircle, badgeColor: 'text-accent' },
  { href: '/user/notifications', label: 'Notifications', icon: Mail },
  { href: '/user/billing', label: 'Wallet & Payment Gateway', icon: CreditCard },
  { href: '/user/profile', label: 'Account & Org Profile', icon: Users2 },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => setOrgData(data))
      .catch((err) => console.error('Failed to load org data', err));

    fetch(`${getApiBaseUrl()}/v1/auth/me`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setEmail(json?.data?.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  const getPageTitle = () => {
    if (pathname === '/user') return 'Overview';
    if (pathname.includes('/projects')) return 'Projects and API keys';
    if (pathname.includes('/sandbox')) return 'Sandbox';
    if (pathname.includes('/storage')) return 'Recording storage';
    if (pathname.includes('/firebase')) return 'Firebase push';
    if (pathname.includes('/webhooks')) return 'Webhooks';
    if (pathname.includes('/usage')) return 'Sessions and recordings';
    if (pathname.includes('/kyc')) return 'Business verification (KYC)';
    if (pathname.includes('/team')) return 'Team and roles';
    if (pathname.includes('/audit')) return 'Audit trail';
    if (pathname.includes('/tickets')) return 'Support';
    if (pathname.includes('/notifications')) return 'Notifications';
    if (pathname.includes('/billing')) return 'Wallet and GST';
    return 'Console';
  };

  return (
    <div className="min-h-screen bg-paper flex text-ink selection:bg-accent selection:text-white font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-line flex flex-col justify-between hidden md:flex shrink-0 sticky top-0 h-screen">
        <div className="flex flex-col min-h-0">
          {/* Logo */}
          <div className="p-6 border-b border-line flex items-center justify-between shrink-0">
            <Link href="/user" className="block">
              <span className="font-display text-xl font-semibold tracking-tight">
                Nexora<span className="text-accent">.</span>rtc
              </span>
              <div className="font-mono text-[10px] text-muted">Console</div>
            </Link>
          </div>

          {/* Org & Wallet Badge */}
          <div className="p-4 mx-4 mt-4 rounded-md bg-paper border border-line space-y-1 shrink-0">
            <div className="text-[11px] font-semibold text-muted">Organization</div>
            <div className="text-sm font-bold text-ink truncate">
              {orgData?.name ?? '—'}
            </div>
            <div className="pt-1 text-xs text-muted">Wallet balance</div>
            <div className="font-mono tabular text-lg font-semibold text-ink">
              {orgData ? `₹${Number(orgData.walletBalance).toFixed(2)}` : '—'}
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-4 space-y-1 overflow-y-auto flex-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(item.href + '/');

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 pl-3 pr-3.5 py-2.5 border-l-2 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-accent bg-paper text-ink'
                      : 'border-transparent text-muted hover:bg-paper hover:text-ink'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${item.badgeColor || ''}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card */}
        <div className="p-4 border-t border-line flex items-center justify-between shrink-0">
          <Link href="/user/profile" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 rounded-full bg-accent/15 text-accent-deep font-bold text-xs flex items-center justify-center">
              {(email ?? '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-ink max-w-36 truncate">{email ?? 'Signed in'}</div>
              <div className="text-[10px] text-accent font-medium hover:underline">Manage profile</div>
            </div>
          </Link>
          <button
            onClick={async () => {
              try {
                await fetch(`${getApiBaseUrl()}/v1/auth/logout`, {
                  method: 'POST',
                  credentials: 'include',
                });
              } catch (_) {}
              document.cookie = 'nexora_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              document.cookie = 'nexora_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              router.replace('/login');
              router.refresh();
            }}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-paper-deep transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>


      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-line px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-base md:text-lg text-ink">
              {getPageTitle()}
            </h1>
            <span className="hidden sm:inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-sm bg-emerald-50 text-emerald-700 border border-emerald-200">
              User Control Plane Online
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-muted hover:text-accent flex items-center gap-1"
            >
              Public Site <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-6 md:p-8 space-y-6 max-w-6xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
