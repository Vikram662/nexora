'use client';

import { createContext, useContext } from 'react';

// Mirrors the @RequireStaff roles on the backend admin endpoints. The backend is the real check;
// this only decides what the admin console shows.
export type StaffRole = 'SUPER_ADMIN' | 'SUPPORT' | 'BILLING_OPS' | 'KYC_REVIEWER' | 'SECURITY_ADMIN';

export type StaffArea =
  | 'overview'
  | 'organizations'
  | 'adjustBalance'
  | 'billing'
  | 'offers'
  | 'kyc'
  | 'tickets'
  | 'audit'
  | 'settings';

const ACCESS: Record<StaffArea, StaffRole[] | 'all'> = {
  overview: 'all',
  organizations: 'all',
  adjustBalance: ['BILLING_OPS'],
  billing: ['BILLING_OPS'],
  offers: ['BILLING_OPS'],
  kyc: ['KYC_REVIEWER'],
  tickets: ['SUPPORT'],
  audit: ['SECURITY_ADMIN'],
  settings: [],
};

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SUPPORT: 'Support',
  BILLING_OPS: 'Billing Ops',
  KYC_REVIEWER: 'KYC Reviewer',
  SECURITY_ADMIN: 'Security Admin',
};

export function staffCan(role: StaffRole | null, area: StaffArea): boolean {
  if (!role) return false;
  if (role === 'SUPER_ADMIN') return true;
  const allowed = ACCESS[area];
  return allowed === 'all' || allowed.includes(role);
}

/** The admin console area a path belongs to. */
export function areaForPath(pathname: string): StaffArea {
  const section = pathname.split('/')[2] ?? '';
  switch (section) {
    case 'organizations':
    case 'billing':
    case 'offers':
    case 'kyc':
    case 'tickets':
    case 'audit':
    case 'settings':
      return section;
    default:
      return 'overview';
  }
}

export interface StaffSession {
  email: string | null;
  role: StaffRole | null;
}

export const StaffSessionContext = createContext<StaffSession>({ email: null, role: null });

/** Whether the signed-in staff member may use an area. For use inside the admin console. */
export function useStaffCan(area: StaffArea): boolean {
  return staffCan(useContext(StaffSessionContext).role, area);
}
