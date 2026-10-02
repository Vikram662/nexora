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
  Menu,
  X,
} from 'lucide-react';
import { fetchOrganizationData, fetchOrganizations, switchOrganization, OrganizationData, OrganizationChoice, getApiBaseUrl } from '@/lib/api';

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
  const [organizations, setOrganizations] = useState<OrganizationChoice[]>([]);
  // Below md the sidebar is a drawer opened from the header.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => setOrgData(data))
      .catch((err) => console.error('Failed to load org data', err));

    fetchOrganizations().then(setOrganizations).catch(() => setOrganizations([]));

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
    <div className="min-h-screen bg-[#f4f6fa] flex text-ink selection:bg-accent selection:text-white font-sans">
      {navOpen && (
        <div className="fixed inset-0 z-40 bg-ink/40 md:hidden" onClick={() => setNavOpen(false)} aria-hidden="true" />
      )}

      {/* Sidebar */}
      <aside
        id="console-nav"
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false); }}
        className={`fixed inset-y-0 left-0 z-50 h-screen w-64 flex flex-col justify-between shrink-0 transition-transform duration-200 md:sticky md:top-0 md:z-20 md:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'} bg-white md:bg-white/80 md:backdrop-blur-md border-r border-[#e2e7f0]`}
      >
        <div className="flex flex-col min-h-0">
          {/* Logo */}
          <div className="p-5 border-b border-[#e2e7f0]/80 flex items-center justify-between shrink-0">
            <Link href="/user" className="flex items-center gap-2.5 group">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-accent to-indigo-500 flex items-center justify-center text-white shadow-md shadow-accent/20 group-hover:scale-105 transition-transform">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <span className="font-display text-lg font-bold tracking-tight text-ink block leading-none">
                  Nexora<span className="text-accent">.</span>rtc
                </span>
                <span className="text-[10px] font-mono text-muted tracking-wide uppercase">Developer Console</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setNavOpen(false)}
              aria-label="Close menu"
              className="md:hidden p-1.5 rounded-lg text-muted hover:text-ink hover:bg-paper-deep cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Org & Wallet Badge */}
          <div className="p-3.5 mx-3 mt-3.5 rounded-xl bg-gradient-to-br from-white to-[#f4f6fa] border border-[#e2e7f0] shadow-xs space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Organization</div>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            {organizations.length > 1 ? (
              <select
                aria-label="Switch organization"
                value={organizations.find((o) => o.current)?.organizationId ?? ''}
                onChange={async (e) => {
                  await switchOrganization(e.target.value);
                  // A full load so every panel starts with the other organization's data.
                  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                  window.location.href = '/user';
                }}
                className="w-full px-2 py-1 bg-white border border-[#e2e7f0] rounded-lg text-xs font-semibold text-ink truncate cursor-pointer hover:border-accent focus:border-accent"
              >
                {organizations.map((o) => (
                  <option key={o.organizationId} value={o.organizationId}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-xs font-bold text-ink truncate">{orgData?.name ?? 'Loading...'}</div>
            )}
            
            <div className="pt-2 border-t border-[#e2e7f0]/60 flex items-baseline justify-between">
              <span className="text-[11px] text-muted font-medium">Balance</span>
              <span className="font-mono text-sm font-bold text-ink bg-white px-2 py-0.5 rounded-md border border-[#e2e7f0]">
                {orgData ? `₹${Number(orgData.walletBalance).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="p-3 space-y-0.5 overflow-y-auto flex-1">
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
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-accent text-white shadow-xs font-semibold'
                      : 'text-[#475569] hover:bg-[#f1f4f9] hover:text-ink'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${isActive ? 'text-white' : item.badgeColor || 'text-slate-500'}`} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card */}
        <div className="p-3.5 border-t border-[#e2e7f0] flex items-center justify-between shrink-0 bg-white/50">
          <Link href="/user/profile" className="flex items-center gap-2.5 hover:opacity-85 transition-opacity min-w-0">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-accent to-purple-600 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
              {(email ?? '?').slice(0, 2).toUpperCase()}
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-semibold text-ink truncate max-w-[110px]">{email ?? 'Signed in'}</div>
              <div className="text-[10px] text-accent font-medium hover:underline">Manage Profile</div>
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
              router.replace('/login');
              router.refresh();
            }}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 glass-header border-b border-[#e2e7f0] px-4 sm:px-6 md:px-8 flex items-center justify-between gap-3 sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={navOpen}
              aria-controls="console-nav"
              className="md:hidden -ml-1 p-2 rounded-lg text-muted hover:text-ink hover:bg-paper-deep cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="font-display font-bold text-lg md:text-xl text-ink tracking-tight truncate">
              {getPageTitle()}
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Cluster Active
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs font-semibold text-muted hover:text-accent flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#e2e7f0] bg-white hover:bg-slate-50 transition-colors shadow-2xs"
            >
              Public Site <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </header>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
