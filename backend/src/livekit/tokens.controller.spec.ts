import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokensController } from './tokens.controller.js';

describe('TokensController Race-Free Wallet Deduction', () => {
  let controller: TokensController;
  let mockLivekitService: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockLivekitService = {
      mintToken: vi.fn().mockResolvedValue({
        token: 'mock_jwt_token',
        ttl: 600,
      }),
    };

    mockPrisma = {
      organization: {
        updateMany: vi.fn(),
      },
      usageLog: {
        create: vi.fn(),
      },
    };

    controller = new TokensController(mockLivekitService as any, mockPrisma as any);
  });

  it('should atomically deduct balance and succeed if wallet has sufficient balance', async () => {
    // updateMany returns count: 1 meaning condition (walletBalance >= required) held
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.usageLog.create.mockResolvedValue({ id: 'log_1' });

    const req = {
      project: {
        id: 'proj_1',
        environment: 'PRODUCTION',
        maxTokenTtlSeconds: 1800,
      },
      organization: {
        id: 'org_1',
        walletBalance: 100,
        customMinuteRate: 0.0035,
      },
    };

    const res = await controller.createToken(
      {
        roomName: 'secure-room',
        participantIdentity: 'user-alice',
        ttlSeconds: 600,
      },
      req,
    );

    expect(res.status).toBe('success');
    expect(res.data.token).toBe('mock_jwt_token');
    expect(mockPrisma.organization.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'org_1',
        walletBalance: {
          gte: expect.any(Number),
        },
      },
      data: {
        walletBalance: {
          decrement: expect.any(Number),
        },
      },
    });
    expect(mockPrisma.usageLog.create).toHaveBeenCalled();
  });

  it('should reject immediately if atomic conditional update count is 0 (insufficient balance / race)', async () => {
    // Simulates concurrent request exhausting balance: updateMany matches 0 rows
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 0 });

    const req = {
      project: {
        id: 'proj_1',
        environment: 'PRODUCTION',
        maxTokenTtlSeconds: 1800,
      },
      organization: {
        id: 'org_1',
        walletBalance: 0,
        customMinuteRate: 0.0035,
      },
    };

    await expect(
      controller.createToken(
        {
          roomName: 'secure-room',
          participantIdentity: 'user-bob',
          ttlSeconds: 600,
        },
        req,
      ),
    ).rejects.toThrow('Insufficient wallet balance');

    expect(mockLivekitService.mintToken).not.toHaveBeenCalled();
  });
});
