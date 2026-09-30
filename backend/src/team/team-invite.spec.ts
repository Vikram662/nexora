import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { signInviteToken, verifyInviteToken } from './invite-token.js';
import { INVITE_TTL_MS, TeamInviteService } from './team-invite.service.js';
import { AuthController } from '../auth/auth.controller.js';
import { buildEmail } from '../notifications/notification-templates.js';

beforeAll(() => {
  process.env.JWT_SECRET = 'test_jwt_secret_32_characters_long_123';
});

describe('invite token', () => {
  it('round-trips a genuine token and rejects tampering', () => {
    const token = signInviteToken('inv_123');
    expect(verifyInviteToken(token)).toBe('inv_123');
    expect(verifyInviteToken(token.replace('inv_123', 'inv_999'))).toBeNull();
    expect(verifyInviteToken(token.slice(0, -2) + 'aa')).toBeNull();
    expect(verifyInviteToken('inv_123')).toBeNull();
    expect(verifyInviteToken('')).toBeNull();
    expect(verifyInviteToken('.abc')).toBeNull();
  });

  it('depends on the server secret', () => {
    const token = signInviteToken('inv_123');
    process.env.JWT_SECRET = 'a_completely_different_secret_value_1234';
    expect(verifyInviteToken(token)).toBeNull();
    process.env.JWT_SECRET = 'test_jwt_secret_32_characters_long_123';
  });
});

describe('TeamInviteService', () => {
  const NOW = new Date('2026-09-30T10:00:00Z');
  let prisma: any;
  let tx: any;
  let crypto: any;
  let notifications: any;
  let service: TeamInviteService;

  const invite = (over: object = {}) => ({
    id: 'inv_1',
    organizationId: 'org_1',
    email: 'new@acme.com',
    role: 'DEVELOPER',
    acceptedAt: null,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 1000),
    organization: { name: 'Acme' },
    ...over,
  });
  const token = () => signInviteToken('inv_1');

  beforeEach(() => {
    tx = {
      user: { create: vi.fn().mockResolvedValue({ id: 'u_new' }), update: vi.fn().mockResolvedValue({ id: 'u_old' }) },
      orgMember: { create: vi.fn().mockResolvedValue({}), findFirst: vi.fn().mockResolvedValue(null) },
      teamInvite: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      orgMember: { findFirst: vi.fn().mockResolvedValue(null) },
      teamInvite: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn(async ({ data }: any) => ({ id: 'inv_1', ...data })),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue(invite()),
      },
      $transaction: vi.fn(async (fn: any) => fn(tx)),
    };
    crypto = { hashApiSecret: vi.fn().mockResolvedValue('hashed') };
    notifications = { queue: vi.fn().mockResolvedValue(undefined) };
    service = new TeamInviteService(prisma, crypto, notifications);
  });

  describe('create', () => {
    it('creates a 7 day invite and emails it even if the org turned emails off', async () => {
      const created = await service.create({ organizationId: 'org_1', email: '  New@Acme.com ', role: 'DEVELOPER', invitedByUserId: 'u1', now: NOW });
      expect(created.email).toBe('new@acme.com');
      expect(created.expiresAt.getTime()).toBe(NOW.getTime() + INVITE_TTL_MS);
      expect(notifications.queue).toHaveBeenCalledWith('org_1', 'TEAM_INVITE', { inviteId: 'inv_1', role: 'DEVELOPER' }, 'new@acme.com', { ignorePreference: true });
    });

    it('cancels the earlier link when the same address is invited again', async () => {
      await service.create({ organizationId: 'org_1', email: 'new@acme.com', role: 'ADMIN', now: NOW });
      expect(prisma.teamInvite.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org_1', email: 'new@acme.com', acceptedAt: null, revokedAt: null },
        data: { revokedAt: NOW },
      });
    });

    it('refuses someone who already belongs to the organization, and bad addresses', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u9' });
      prisma.orgMember.findFirst.mockResolvedValue({ id: 'm1' });
      await expect(service.create({ organizationId: 'org_1', email: 'new@acme.com', role: 'ADMIN' })).rejects.toThrow('already a member');
      await expect(service.create({ organizationId: 'org_1', email: 'not-an-email', role: 'ADMIN' })).rejects.toThrow('valid email');
    });
  });

  describe('revoke and list', () => {
    it('revokes only a pending invite of the same organization', async () => {
      prisma.teamInvite.updateMany.mockResolvedValue({ count: 1 });
      await service.revoke('org_1', 'inv_1', NOW);
      expect(prisma.teamInvite.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv_1', organizationId: 'org_1', acceptedAt: null, revokedAt: null },
        data: { revokedAt: NOW },
      });
      prisma.teamInvite.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('org_1', 'inv_x')).rejects.toThrow(NotFoundException);
    });

    it('lists only invites that are still usable', async () => {
      await service.listPending('org_1', NOW);
      expect(prisma.teamInvite.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org_1', acceptedAt: null, revokedAt: null, expiresAt: { gt: NOW } });
    });
  });

  describe('link checks', () => {
    it('rejects forged, used, cancelled and expired links', async () => {
      await expect(service.preview('inv_1.forged', NOW)).rejects.toThrow('not valid');
      prisma.teamInvite.findUnique.mockResolvedValue(invite({ acceptedAt: NOW }));
      await expect(service.preview(token(), NOW)).rejects.toThrow('already used');
      prisma.teamInvite.findUnique.mockResolvedValue(invite({ revokedAt: NOW }));
      await expect(service.preview(token(), NOW)).rejects.toThrow('cancelled');
      prisma.teamInvite.findUnique.mockResolvedValue(invite({ expiresAt: new Date(NOW.getTime() - 1) }));
      await expect(service.preview(token(), NOW)).rejects.toThrow('expired');
    });

    it('previews whether the invited address already has an account', async () => {
      expect(await service.preview(token(), NOW)).toMatchObject({ email: 'new@acme.com', organizationName: 'Acme', hasAccount: false });
      prisma.user.findUnique.mockResolvedValue({ passwordHash: 'x' });
      expect((await service.preview(token(), NOW)).hasAccount).toBe(true);
    });
  });

  describe('accept as a new user', () => {
    it('creates the account, joins the organization and uses up the invite', async () => {
      const result = await service.acceptAsNewUser(token(), 'a-good-password', ' Riya ', NOW);
      expect(tx.user.create).toHaveBeenCalledWith({ data: { email: 'new@acme.com', passwordHash: 'hashed', name: 'Riya' }, select: { id: true } });
      expect(tx.orgMember.create).toHaveBeenCalledWith({ data: { organizationId: 'org_1', userId: 'u_new', role: 'DEVELOPER', acceptedAt: NOW } });
      expect(tx.teamInvite.updateMany).toHaveBeenCalledWith({ where: { id: 'inv_1', acceptedAt: null, revokedAt: null }, data: { acceptedAt: NOW } });
      expect(result).toMatchObject({ userId: 'u_new', organizationId: 'org_1', role: 'DEVELOPER', organizationName: 'Acme' });
    });

    it('gives a passwordless account (left by the old invite flow) a password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u_old', passwordHash: null });
      await service.acceptAsNewUser(token(), 'a-good-password', undefined, NOW);
      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('sends existing account holders to sign in, and enforces a password length', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u_old', passwordHash: 'x' });
      await expect(service.acceptAsNewUser(token(), 'a-good-password', undefined, NOW)).rejects.toThrow('Sign in');
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.acceptAsNewUser(token(), 'short', undefined, NOW)).rejects.toThrow('at least 8');
    });

    it('does not let two requests use the same link', async () => {
      tx.teamInvite.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.acceptAsNewUser(token(), 'a-good-password', undefined, NOW)).rejects.toThrow('already used');
    });
  });

  describe('accept as an existing user', () => {
    it('adds the membership when the signed-in email matches the invite', async () => {
      const result = await service.acceptAsExistingUser(token(), { userId: 'u1', email: 'New@Acme.com' }, NOW);
      expect(tx.orgMember.create).toHaveBeenCalledWith({ data: { organizationId: 'org_1', userId: 'u1', role: 'DEVELOPER', acceptedAt: NOW } });
      expect(result.organizationId).toBe('org_1');
    });

    it('refuses a different signed-in email', async () => {
      await expect(service.acceptAsExistingUser(token(), { userId: 'u1', email: 'other@acme.com' }, NOW)).rejects.toThrow(ForbiddenException);
      expect(tx.orgMember.create).not.toHaveBeenCalled();
    });

    it('does not add a second membership', async () => {
      tx.orgMember.findFirst.mockResolvedValue({ id: 'm1' });
      await service.acceptAsExistingUser(token(), { userId: 'u1', email: 'new@acme.com' }, NOW);
      expect(tx.orgMember.create).not.toHaveBeenCalled();
    });
  });
});

describe('invite email', () => {
  it('links to the accept page and is sent without an unsubscribe-style dependency on preferences', () => {
    const email = buildEmail('TEAM_INVITE', { token: 'inv_1.abc', role: 'BILLING' }, { siteName: 'Nexora', organizationName: 'Acme', appUrl: 'https://app.example.com/' })!;
    expect(email.subject).toBe('Invitation to join Acme');
    expect(email.text).toContain('https://app.example.com/invite/inv_1.abc');
    expect(email.text).toContain('as billing');
  });
});

describe('AuthController organization switching', () => {
  const build = (membership: object | null) => {
    const prisma: any = { orgMember: { findFirst: vi.fn().mockResolvedValue(membership) } };
    const auth: any = { generateToken: vi.fn().mockReturnValue('jwt_token') };
    const res: any = { cookie: vi.fn(), clearCookie: vi.fn() };
    return { controller: new AuthController(auth, {} as any, prisma), prisma, auth, res };
  };
  const req = (over: object = {}): any => ({ user: { userId: 'u1', email: 'a@b.c', organizationId: 'org_1', isStaff: false, ...over } });

  it('moves the session to an organization the user belongs to', async () => {
    const { controller, prisma, auth, res } = build({ role: 'ADMIN', organization: { name: 'Other Org' } });
    const out: any = await controller.switchOrganization({ organizationId: 'org_2' }, req(), res);
    expect(prisma.orgMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', organizationId: 'org_2' } }));
    expect(auth.generateToken).toHaveBeenCalledWith({ userId: 'u1', email: 'a@b.c', organizationId: 'org_2', role: 'ADMIN', isStaff: false });
    expect(res.cookie).toHaveBeenCalledWith('nexora_auth_token', 'jwt_token', expect.objectContaining({ httpOnly: true }));
    expect(out.data.user.organizationId).toBe('org_2');
  });

  it('refuses an organization the user is not a member of, and staff accounts', async () => {
    const { controller, res } = build(null);
    await expect(controller.switchOrganization({ organizationId: 'org_x' }, req(), res)).rejects.toThrow(BadRequestException);
    await expect(controller.switchOrganization({ organizationId: 'org_x' }, req({ isStaff: true }), res)).rejects.toThrow(ForbiddenException);
  });
});
