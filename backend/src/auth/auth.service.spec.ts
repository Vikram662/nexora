import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service.js';

describe('AuthService Security & Password Enforcement', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockCrypto: any;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test_jwt_secret_32_characters_long_123';
    process.env.STAFF_OPS_ORG_ID = 'org_staff_fixed_ops_center';

    mockPrisma = {
      staffUser: {
        findUnique: vi.fn(),
      },
      user: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      organization: {
        create: vi.fn(),
      },
    };

    mockCrypto = {
      verifyApiSecret: vi.fn().mockResolvedValue(false),
      hashApiSecret: vi.fn().mockResolvedValue('hashed_pwd_123'),
    };

    authService = new AuthService(mockPrisma as any, mockCrypto as any);
    authService.onModuleInit();
  });

  describe('login security checks', () => {
    it('should reject login if password is omitted', async () => {
      await expect(
        authService.login('alice@example.com', undefined),
      ).rejects.toThrow('Email and password are required');
    });

    it('should reject login if user does not exist (no auto-provisioning)', async () => {
      mockPrisma.staffUser.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authService.login('unknown@example.com', 'password123'),
      ).rejects.toThrow('Invalid email or password');

      expect(mockPrisma.organization.create).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('should reject login if user exists but has no password hash set', async () => {
      mockPrisma.staffUser.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: null,
      });

      await expect(
        authService.login('alice@example.com', 'some_password'),
      ).rejects.toThrow('Account has no password configured');
    });

    it('should reject login if password verification fails', async () => {
      mockPrisma.staffUser.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'alice@example.com',
        passwordHash: 'valid_stored_hash',
      });
      mockCrypto.verifyApiSecret.mockResolvedValue(false);

      await expect(
        authService.login('alice@example.com', 'wrong_password'),
      ).rejects.toThrow('Invalid email or password');
    });

    it('should succeed and assign fixed ops org ID for staff, never findFirst()', async () => {
      mockPrisma.staffUser.findUnique.mockResolvedValue({
        id: 'staff_1',
        email: 'admin@nexora.io',
        passwordHash: 'staff_hash',
        role: 'SUPER_ADMIN',
      });
      mockCrypto.verifyApiSecret.mockResolvedValue(true);

      const res = await authService.login('admin@nexora.io', 'correct_staff_pass');

      expect(res.user.isStaff).toBe(true);
      expect(res.user.organizationId).toBe('org_staff_fixed_ops_center');
      expect(res.token).toBeDefined();
    });
  });

  describe('signup validation', () => {
    it('should reject passwords shorter than 8 characters', async () => {
      await expect(
        authService.signup({
          email: 'new@example.com',
          orgName: 'My Org',
          passwordPlain: 'short',
        }),
      ).rejects.toThrow('Password must be at least 8 characters long');
    });

    it('should create new organization with zero balance', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.organization.create.mockResolvedValue({ id: 'org_new' });
      mockPrisma.user.create.mockResolvedValue({ id: 'u_new', email: 'new@example.com' });

      const res = await authService.signup({
        email: 'new@example.com',
        orgName: 'New Enterprise',
        passwordPlain: 'supersecret123',
      });

      expect(res.user.email).toBe('new@example.com');
      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: {
          name: 'New Enterprise',
          billingEmail: 'new@example.com',
          planTier: 'STARTER',
          walletBalance: 0.0,
        },
      });
    });
  });
});
