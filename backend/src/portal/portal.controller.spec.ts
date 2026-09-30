import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PortalController } from './portal.controller.js';

describe('PortalController Tenant Isolation & Redaction', () => {
  let controller: PortalController;
  let mockPrisma: any;
  let mockCrypto: any;
  let mockKycGateway: any;
  let mockPaymentService: any;

  beforeEach(() => {
    mockPrisma = {
      organization: {
        findUnique: vi.fn(),
      },
      project: {
        create: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      user: { findUnique: vi.fn(), update: vi.fn() },
      orgMember: { findFirst: vi.fn() },
      credentialAccessLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    mockCrypto = {
      encrypt: vi.fn().mockReturnValue({ ciphertext: 'enc', iv: 'iv', authTag: 'tag' }),
      decrypt: vi.fn().mockReturnValue('AAACA9928F'),
      hashApiSecret: vi.fn().mockResolvedValue('hash_secret_123'),
    };

    mockKycGateway = {};
    mockPaymentService = {};

    controller = new PortalController(
      mockPrisma as any,
      mockCrypto as any,
      mockKycGateway as any,
      {} as any,
      mockPaymentService as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should scope getOrganization strictly to req.user.organizationId', async () => {
    const orgId = 'org_tenant_alpha_42';
    mockPrisma.organization.findUnique.mockResolvedValue({
      id: orgId,
      name: 'Alpha Corp',
      walletBalance: 2500,
      projects: [
        {
          id: 'proj_1',
          name: 'Main App',
          apiSecretHash: 'SECRET_HASH_MUST_NEVER_LEAK',
          previousSecretHash: 'PREV_HASH_MUST_NEVER_LEAK',
        },
      ],
      kycVerification: null,
    });

    const req: any = {
      user: {
        userId: 'usr_1',
        organizationId: orgId,
        role: 'OWNER',
        isStaff: false,
      },
    };

    const res = await controller.getOrganization(req);

    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: orgId },
      include: expect.any(Object),
    });

    expect(res.status).toBe('success');
    expect(res.data.id).toBe(orgId);

    // Verify Project.apiSecretHash is sanitized and NOT returned to client
    const project = res.data.projects[0];
    expect(project.apiSecretHash).toBeUndefined();
    expect(project.previousSecretHash).toBeUndefined();
  });

  it('shows only credential access logs that belong to the caller organization', async () => {
    mockPrisma.project.findMany.mockResolvedValue([{ id: 'proj_a' }, { id: 'proj_b' }]);
    const req: any = { user: { organizationId: 'org_tenant_alpha_42' } };
    await controller.getAuditLog(req);
    expect(mockPrisma.credentialAccessLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { targetId: { in: ['org_tenant_alpha_42', 'proj_a', 'proj_b'] } } }),
    );
  });

  it('returns only the signed-in user own profile', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Riya', email: 'r@acme.com', phone: '+919999999999' });
    mockPrisma.organization.findUnique.mockResolvedValue({ name: 'Acme' });
    mockPrisma.orgMember.findFirst.mockResolvedValue({ role: 'OWNER' });
    const res: any = await controller.getProfile({ user: { userId: 'u1', organizationId: 'org_1', role: 'OWNER' } } as any);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(res.data).toMatchObject({ email: 'r@acme.com', role: 'OWNER', organizationName: 'Acme' });
  });

  it('updates the name and phone, and clears the phone with an empty string', async () => {
    mockPrisma.user.update.mockResolvedValue({ name: 'Riya K', email: 'r@acme.com', phone: null });
    await controller.updateProfile({ name: ' Riya K ', phone: '' }, { user: { userId: 'u1' } } as any);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' }, data: { name: 'Riya K', phone: null } }));
  });

  it('explains a phone number that another account already uses', async () => {
    mockPrisma.user.update.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    await expect(controller.updateProfile({ phone: '+919999999999' }, { user: { userId: 'u1' } } as any)).rejects.toThrow('already used by another account');
  });
});
