import { describe, it, expect } from 'vitest';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { PortalController } from '../portal/portal.controller.js';

type User = { role: string; isStaff: boolean } | undefined;

// Runs the guard against a real controller method, so the decorators on the controller are what is tested.
function allowed(method: keyof PortalController, user: User): boolean {
  const guard = new RolesGuard(new Reflector());
  const handler = PortalController.prototype[method] as unknown as () => void;
  const context = {
    getHandler: () => handler,
    getClass: () => PortalController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  try {
    return guard.canActivate(context);
  } catch (err) {
    if (err instanceof ForbiddenException) return false;
    throw err;
  }
}

const staff = (role: string) => ({ role, isStaff: true });
const customer = (role: string) => ({ role, isStaff: false });

const STAFF_ROLES = ['SUPER_ADMIN', 'SUPPORT', 'BILLING_OPS', 'KYC_REVIEWER', 'SECURITY_ADMIN'];

// Which staff roles may use each admin area (SUPER_ADMIN always may).
const ACCESS: Array<[keyof PortalController, string[]]> = [
  ['getAdminOverview', STAFF_ROLES],
  ['getSystemHealth', STAFF_ROLES],
  ['getAdminOrganizations', STAFF_ROLES],
  ['adjustOrgBalance', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['getAdminKycList', ['SUPER_ADMIN', 'KYC_REVIEWER']],
  ['reviewKycSubmission', ['SUPER_ADMIN', 'KYC_REVIEWER']],
  ['getAdminTickets', ['SUPER_ADMIN', 'SUPPORT']],
  ['adminReplyTicket', ['SUPER_ADMIN', 'SUPPORT']],
  ['getAdminBillingOverview', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['generateInvoices', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['issueCreditNote', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['getGstr1Report', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['getAdminOffers', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['createAdminOffer', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['toggleAdminOffer', ['SUPER_ADMIN', 'BILLING_OPS']],
  ['getAdminSettings', ['SUPER_ADMIN']],
  ['updateAdminSettings', ['SUPER_ADMIN']],
  ['getAdminAuditLog', ['SUPER_ADMIN', 'SECURITY_ADMIN']],
];

describe('RolesGuard staff access', () => {
  for (const [method, roles] of ACCESS) {
    for (const role of STAFF_ROLES) {
      const expected = roles.includes(role);
      it(`${role} ${expected ? 'can' : 'cannot'} call ${method}`, () => {
        expect(allowed(method, staff(role))).toBe(expected);
      });
    }
    it(`customers cannot call ${method}`, () => {
      expect(allowed(method, customer('OWNER'))).toBe(false);
    });
  }

  it('rejects a request without a user', () => {
    expect(allowed('getAdminOverview', undefined)).toBe(false);
  });

  it('keeps customer role checks working', () => {
    expect(allowed('inviteTeamMember', customer('OWNER'))).toBe(true);
    expect(allowed('inviteTeamMember', customer('DEVELOPER'))).toBe(false);
  });
});
