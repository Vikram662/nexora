import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard.js';

const ctx = (ip: string, apiKey: string, secret: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ ip, headers: { 'x-api-key': apiKey, 'x-api-secret': secret } }),
    }),
  }) as any;

describe('ApiKeyGuard lockout scope', () => {
  const project = {
    id: 'p1',
    isSuspended: false,
    environment: 'SANDBOX',
    apiSecretHash: 'hash',
    organization: { walletBalance: 0 },
  };
  const prisma: any = { project: { findUnique: vi.fn().mockResolvedValue(project) } };
  const crypto: any = { verifyApiSecret: vi.fn(async (secret: string) => secret === 'good') };
  const guard = new ApiKeyGuard(prisma, crypto);

  it('locks out the attacking IP without locking out the key owner', async () => {
    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(ctx('6.6.6.6', 'pk_test_scope', 'bad'))).rejects.toThrow(UnauthorizedException);
    }
    await expect(guard.canActivate(ctx('6.6.6.6', 'pk_test_scope', 'good'))).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(ctx('1.2.3.4', 'pk_test_scope', 'good'))).resolves.toBe(true);
  });
});
