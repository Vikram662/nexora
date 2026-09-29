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
});
