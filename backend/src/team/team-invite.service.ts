import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { verifyInviteToken } from './invite-token.js';

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type InviteRole = 'ADMIN' | 'DEVELOPER' | 'BILLING';

export interface AcceptedInvite {
  userId: string;
  email: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

@Injectable()
export class TeamInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** Creates an invitation and emails the link. Inviting the same address again cancels the earlier link. */
  async create(input: { organizationId: string; email: string; role: InviteRole; invitedByUserId?: string; now?: Date }) {
    const now = input.now ?? new Date();
    const email = input.email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(email)) throw new BadRequestException('Enter a valid email address.');

    const existingUser = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existingUser) {
      const member = await this.prisma.orgMember.findFirst({ where: { organizationId: input.organizationId, userId: existingUser.id }, select: { id: true } });
      if (member) throw new BadRequestException('This person is already a member of your organization.');
    }

    await this.prisma.teamInvite.updateMany({
      where: { organizationId: input.organizationId, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const invite = await this.prisma.teamInvite.create({
      data: {
        organizationId: input.organizationId,
        email,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      },
    });
    // Invitations are transactional: they are sent even if the organization turned notification emails off.
    await this.notifications?.queue(input.organizationId, 'TEAM_INVITE', { inviteId: invite.id, role: input.role }, email, { ignorePreference: true });
    return invite;
  }

  listPending(organizationId: string, now = new Date()) {
    return this.prisma.teamInvite.findMany({
      where: { organizationId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
  }

  async revoke(organizationId: string, inviteId: string, now = new Date()) {
    const result = await this.prisma.teamInvite.updateMany({
      where: { id: inviteId, organizationId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    if (result.count === 0) throw new NotFoundException('Invitation not found, or it was already used or cancelled.');
  }

  /** Finds the invitation behind a link and checks it can still be used. */
  private async load(token: string, now: Date) {
    const inviteId = verifyInviteToken(token ?? '');
    const invite = inviteId
      ? await this.prisma.teamInvite.findUnique({ where: { id: inviteId }, include: { organization: { select: { name: true } } } })
      : null;
    if (!invite) throw new BadRequestException('This invitation link is not valid.');
    if (invite.acceptedAt) throw new BadRequestException('This invitation was already used.');
    if (invite.revokedAt) throw new BadRequestException('This invitation was cancelled. Ask for a new one.');
    if (invite.expiresAt <= now) throw new BadRequestException('This invitation has expired. Ask for a new one.');
    return invite;
  }

  async preview(token: string, now = new Date()) {
    const invite = await this.load(token, now);
    const user = await this.prisma.user.findUnique({ where: { email: invite.email }, select: { passwordHash: true } });
    return {
      email: invite.email,
      role: invite.role,
      organizationName: invite.organization.name,
      expiresAt: invite.expiresAt,
      hasAccount: Boolean(user?.passwordHash),
    };
  }

  /** For someone with no account yet: sets their password, creates the membership, and marks the invite used. */
  async acceptAsNewUser(token: string, password: string, name?: string, now = new Date()): Promise<AcceptedInvite> {
    const invite = await this.load(token, now);
    if (!password || password.length < 8) throw new BadRequestException('Password must be at least 8 characters long.');

    const existing = await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true, passwordHash: true } });
    if (existing?.passwordHash) {
      throw new BadRequestException('You already have an account. Sign in, then open this link again.');
    }
    const passwordHash = await this.crypto.hashApiSecret(password);
    const displayName = name?.trim() || invite.email.split('@')[0];

    try {
      const userId = await this.prisma.$transaction(async (tx) => {
        const user = existing
          ? await tx.user.update({ where: { id: existing.id }, data: { passwordHash, name: displayName }, select: { id: true } })
          : await tx.user.create({ data: { email: invite.email, passwordHash, name: displayName }, select: { id: true } });
        await tx.orgMember.create({ data: { organizationId: invite.organizationId, userId: user.id, role: invite.role, acceptedAt: now } });
        const claimed = await tx.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: now } });
        if (claimed.count === 0) throw new BadRequestException('This invitation was already used.');
        return user.id;
      });
      return { userId, email: invite.email, organizationId: invite.organizationId, organizationName: invite.organization.name, role: invite.role };
    } catch (err: any) {
      if (err?.code === 'P2002') throw new BadRequestException('You are already a member of this organization.');
      throw err;
    }
  }

  /** For someone who already has an account and is signed in with the invited email address. */
  async acceptAsExistingUser(token: string, user: { userId: string; email: string }, now = new Date()): Promise<AcceptedInvite> {
    const invite = await this.load(token, now);
    if (user.email.trim().toLowerCase() !== invite.email) {
      throw new ForbiddenException(`This invitation was sent to ${invite.email}. Sign in with that address to accept it.`);
    }
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.orgMember.findFirst({ where: { organizationId: invite.organizationId, userId: user.userId }, select: { id: true } });
      if (!member) {
        await tx.orgMember.create({ data: { organizationId: invite.organizationId, userId: user.userId, role: invite.role, acceptedAt: now } });
      }
      const claimed = await tx.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null, revokedAt: null }, data: { acceptedAt: now } });
      if (claimed.count === 0) throw new BadRequestException('This invitation was already used.');
    });
    return { userId: user.userId, email: invite.email, organizationId: invite.organizationId, organizationName: invite.organization.name, role: invite.role };
  }
}
