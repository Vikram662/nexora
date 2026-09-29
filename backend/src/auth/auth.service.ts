import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { JwtUserPayload } from './auth.types.js';

// Fixed dummy hash with cost factor 12 to ensure constant-time timing on nonexistent accounts
const DUMMY_USER_HASH = '$2a$12$e80yvQzG1m64v2z1Vv2PquFzV3Y2N2k0N2o5K6W4u1z9V0z8k7e2m';

@Injectable()
export class AuthService implements OnModuleInit {
  private jwtSecret!: string;
  private opsOrgId!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit() {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.trim().length < 32) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable is missing or too short. ' +
        'It must be at least 32 characters long. Generate one using: openssl rand -hex 32'
      );
    }
    this.jwtSecret = secret.trim();
    this.opsOrgId = process.env.STAFF_OPS_ORG_ID || 'org_nexora_master_ops';
  }

  generateToken(payload: JwtUserPayload): string {
    if (!this.jwtSecret) {
      this.onModuleInit();
    }
    // 24 hour token lifetime
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }

  async login(email: string, passwordPlain?: string): Promise<{ token: string; user: JwtUserPayload }> {
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !passwordPlain) {
      // Run dummy compare to match timing
      await this.crypto.verifyApiSecret(passwordPlain || 'dummy', DUMMY_USER_HASH).catch(() => false);
      throw new UnauthorizedException('Email and password are required');
    }

    // Check staff account first
    const staffUser = await this.prisma.staffUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (staffUser) {
      if (!staffUser.passwordHash) {
        await this.crypto.verifyApiSecret(passwordPlain, DUMMY_USER_HASH).catch(() => false);
        throw new UnauthorizedException('Staff account password hash is not configured');
      }

      const match = await this.crypto.verifyApiSecret(passwordPlain, staffUser.passwordHash);
      if (!match) {
        throw new UnauthorizedException('Invalid email or password');
      }

      const payload: JwtUserPayload = {
        userId: staffUser.id,
        email: staffUser.email,
        organizationId: this.opsOrgId,
        role: staffUser.role,
        isStaff: true,
      };

      const token = this.generateToken(payload);
      return { token, user: payload };
    }

    // Check regular customer User
    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          include: { organization: true },
        },
      },
    });

    // Timing-attack mitigation: if user not found, perform dummy bcrypt check
    if (!user) {
      await this.crypto.verifyApiSecret(passwordPlain, DUMMY_USER_HASH).catch(() => false);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reject if user has no password hash set
    if (!user.passwordHash) {
      await this.crypto.verifyApiSecret(passwordPlain, DUMMY_USER_HASH).catch(() => false);
      throw new UnauthorizedException('Account has no password configured. Please use reset or contact support.');
    }

    const match = await this.crypto.verifyApiSecret(passwordPlain, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const membership = user.memberships[0];
    const organizationId = membership?.organizationId;
    if (!organizationId) {
      throw new BadRequestException('User is not associated with any organization');
    }

    const payload: JwtUserPayload = {
      userId: user.id,
      email: user.email,
      organizationId,
      role: membership.role,
      isStaff: false,
    };

    const token = this.generateToken(payload);
    return { token, user: payload };
  }

  async signup(data: {
    email: string;
    orgName: string;
    passwordPlain: string;
  }): Promise<{ token: string; user: JwtUserPayload }> {
    const normalizedEmail = data.email?.trim().toLowerCase();

    if (!normalizedEmail || !data.passwordPlain) {
      throw new BadRequestException('Email and password are required');
    }

    if (data.passwordPlain.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new BadRequestException('User with this email already exists. Please log in.');
    }

    const passwordHash = await this.crypto.hashApiSecret(data.passwordPlain);

    const org = await this.prisma.organization.create({
      data: {
        name: data.orgName || `${normalizedEmail.split('@')[0]}'s Org`,
        billingEmail: normalizedEmail,
        planTier: 'STARTER',
        walletBalance: 0.0,
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: normalizedEmail.split('@')[0],
        memberships: {
          create: {
            organizationId: org.id,
            role: 'OWNER',
          },
        },
      },
    });

    const payload: JwtUserPayload = {
      userId: user.id,
      email: user.email,
      organizationId: org.id,
      role: 'OWNER',
      isStaff: false,
    };

    const token = this.generateToken(payload);
    return { token, user: payload };
  }
}
