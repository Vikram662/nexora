import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokensController } from './tokens.controller.js';

describe('TokensController Race-Free Wallet Deduction', () => {
  let controller: TokensController;
  let mockLivekitService: any;
  let mockPrisma: any;
  let mockPricing: any;

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

    mockPricing = {
      resolve: vi.fn().mockResolvedValue({ baseRatePerMinute: 0.0035, gstPercent: 18, ratePerMinuteWithGst: 0.0041 }),
    };

    controller = new TokensController(mockLivekitService as any, mockPrisma as any, mockPricing as any);
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
        planTier: 'STARTER',
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
        planTier: 'STARTER',
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

  it('bills an audio-only token at the AUDIO_CALL rate, looked up from the database', async () => {
    mockPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.usageLog.create.mockResolvedValue({ id: 'log_2' });

    await controller.createToken(
      {
        roomName: 'hotline',
        participantIdentity: 'agent-1',
        grants: { canPublish: true, canPublishSources: ['microphone'] },
      },
      {
        project: { id: 'proj_1', environment: 'PRODUCTION', maxTokenTtlSeconds: 1800 },
        organization: { id: 'org_1', planTier: 'GROWTH', walletBalance: 100 },
      },
    );

    expect(mockPricing.resolve).toHaveBeenCalledWith('org_1', 'GROWTH', 'AUDIO_CALL');
    expect(mockPrisma.usageLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roomType: 'AUDIO_CALL', ratePerMinute: 0.0041 }),
    });
  });

  it('does not mint a token when no rate is configured', async () => {
    mockPricing.resolve.mockRejectedValue(new Error('No VIDEO_CALL rate is configured'));

    await expect(
      controller.createToken(
        { roomName: 'r', participantIdentity: 'u' },
        {
          project: { id: 'proj_1', environment: 'PRODUCTION', maxTokenTtlSeconds: 1800 },
          organization: { id: 'org_1', planTier: 'STARTER', walletBalance: 100 },
        },
      ),
    ).rejects.toThrow('No VIDEO_CALL rate');

    expect(mockPrisma.organization.updateMany).not.toHaveBeenCalled();
    expect(mockLivekitService.mintToken).not.toHaveBeenCalled();
  });
});
