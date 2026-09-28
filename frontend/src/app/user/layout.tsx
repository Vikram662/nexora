'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Radio,
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
import { fetchOrganizationData, OrganizationData } from '@/lib/api';

const NAV_ITEMS = [
  { href: '/user', label: 'Overview & Metrics', icon: Activity, exact: true },
  { href: '/user/projects', label: 'Projects & API Keys', icon: Key },
  { href: '/user/sandbox', label: 'Interactive RTC Sandbox', icon: Video },
  { href: '/docs', label: 'API & SDK Documentation', icon: BookOpen, badgeColor: 'text-blue-600' },
  { href: '/user/storage', label: 'BYOS Storage (S3/R2/GCS)', icon: HardDrive },
  { href: '/user/firebase', label: 'BYOF Firebase (Call Push)', icon: Flame, badgeColor: 'text-amber-500' },
  { href: '/user/webhooks', label: 'Outbound Webhooks', icon: BellRing },
  { href: '/user/usage', label: 'Usage & Recordings', icon: Clock },
  { href: '/user/kyc', label: 'Business KYC Verification', icon: BadgeCheck, badgeColor: 'text-blue-600' },
  { href: '/user/team', label: 'Team & RBAC', icon: Users2 },
  { href: '/user/audit', label: 'Zero-Storage Audit Trail', icon: ShieldCheck, badgeColor: 'text-emerald-600' },
  { href: '/user/tickets', label: 'Support & Tickets', icon: HelpCircle, badgeColor: 'text-indigo-600' },
  { href: '/user/notifications', label: 'Email & SMS Alerts', icon: Mail },
  { href: '/user/billing', label: 'Wallet & Payment Gateway', icon: CreditCard },
  { href: '/user/profile', label: 'Account & Org Profile', icon: Users2 },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [orgData, setOrgData] = useState<OrganizationData | null>(null);

  useEffect(() => {
    fetchOrganizationData()
      .then((data) => setOrgData(data))
      .catch((err) => console.error('Failed to load org data', err));
  }, []);

  const getPageTitle = () => {
    if (pathname === '/user') return 'Platform Overview & Live Metrics';
    if (pathname.includes('/projects')) return 'Projects & API Key Management';
    if (pathname.includes('/sandbox')) return 'Live Video Call Testing Sandbox';
    if (pathname.includes('/storage')) return 'BYOS Recording Storage (AWS S3 / R2 / Google Cloud)';
    if (pathname.includes('/firebase')) return 'BYOF Firebase Config (Push Call Signaling)';
    if (pathname.includes('/webhooks')) return 'Outbound Webhooks Manager';
    if (pathname.includes('/usage')) return 'Real-time Session Logs & Recordings';
    if (pathname.includes('/kyc')) return 'Business KYC & Identity Verification';
    if (pathname.includes('/team')) return 'Team Members & RBAC Permissions';
    if (pathname.includes('/audit')) return 'Zero-Data Storage Proof & Decrypt Audit Trail';
    if (pathname.includes('/tickets')) return 'Developer Support & Technical Helpdesk';
    if (pathname.includes('/notifications')) return 'Email & SMS Notification Routing';
    if (pathname.includes('/billing')) return 'Prepaid Wallet & GST Tax Profile';
    return 'Nexora RTC Developer Console';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex text-slate-800 selection:bg-blue-600 selection:text-white font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between hidden md:flex shrink-0 sticky top-0 h-screen">
        <div className="flex flex-col min-h-0">
          {/* Logo */}
          <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
            <Link href="/user" className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-600/20">
                <Radio className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <span className="font-extrabold text-lg text-slate-900 tracking-tight">Nexora RTC</span>
                <div className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">User Console</div>
              </div>
            </Link>
          </div>

          {/* Org & Wallet Badge */}
          <div className="p-4 mx-4 mt-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1 shrink-0">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Organization</div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {orgData?.name || 'Nexora Demo Org'}
            </div>
            <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 pt-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
              ₹{Number(orgData?.walletBalance || 500).toFixed(2)} Balance
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
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
        <div className="p-4 border-t border-slate-100 flex items-center justify-between shrink-0">
          <Link href="/user/profile" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
            <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs flex items-center justify-center">
              ND
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-900">developer@company.com</div>
              <div className="text-[10px] text-blue-600 font-medium hover:underline">Manage Profile →</div>
            </div>
          </Link>
          <button
            onClick={() => {
              document.cookie = 'nexora_auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              document.cookie = 'nexora_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              window.location.href = '/login';
            }}
            title="Log Out"
            className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>


      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <h1 className="font-extrabold text-base md:text-lg text-slate-900">
              {getPageTitle()}
            </h1>
            <span className="hidden sm:inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              User Control Plane Online
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-xs font-semibold text-slate-600 hover:text-blue-600 flex items-center gap-1"
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
