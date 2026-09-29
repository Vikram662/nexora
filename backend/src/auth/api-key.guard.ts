import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';

interface CacheEntry {
  expiresAt: number;
  projectId: string;
}

interface FailureTracker {
  attempts: number;
  lockedUntil: number;
}

// Dummy constant hash used for constant-time comparison on nonexistent keys
const DUMMY_HASH = '$2a$12$e80yvQzG1m64v2z1Vv2PquFzV3Y2N2k0N2o5K6W4u1z9V0z8k7e2m';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  // Short-lived in-memory cache to mitigate bcrypt cost-12 CPU DoS: key -> { expiresAt, projectId }
  private static verifiedCache = new Map<string, CacheEntry>();
  // Failed attempt rate-limiting / lockout per API key: apiKey -> FailureTracker
  private static failureTracker = new Map<string, FailureTracker>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'] as string;
    const apiSecret = request.headers['x-api-secret'] as string;

    if (!apiKey || !apiSecret) {
      throw new UnauthorizedException(
        'Missing required authentication headers: x-api-key and x-api-secret',
      );
    }

    const now = Date.now();

    // Check rate limit / lockout on key
    const tracker = ApiKeyGuard.failureTracker.get(apiKey);
    if (tracker && tracker.lockedUntil > now) {
      const waitSec = Math.ceil((tracker.lockedUntil - now) / 1000);
      throw new ForbiddenException(
        `Too many failed authentication attempts. Key is locked for ${waitSec}s.`,
      );
    }

    // Check fast verification cache
    const cacheKey = crypto
      .createHash('sha256')
      .update(`${apiKey}:${apiSecret}`)
      .digest('hex');

    const cached = ApiKeyGuard.verifiedCache.get(cacheKey);

    // Lookup project by apiKeyPrefix
    const project = await this.prisma.project.findUnique({
      where: { apiKeyPrefix: apiKey },
      include: {
        organization: true,
      },
    });

    // Constant-time execution to prevent timing attack leaking if key exists
    if (!project) {
      await this.crypto.verifyApiSecret(apiSecret, DUMMY_HASH).catch(() => false);
      this.recordFailure(apiKey);
      throw new UnauthorizedException('Invalid API credentials');
    }

    if (project.isSuspended) {
      throw new ForbiddenException('Project is suspended. Please contact support.');
    }

    let isValid = false;

    if (cached && cached.expiresAt > now && cached.projectId === project.id) {
      isValid = true;
    } else {
      // Verify API secret against active hash or previous rotated hash within grace period
      isValid = await this.crypto.verifyApiSecret(apiSecret, project.apiSecretHash);

      if (!isValid && project.previousSecretHash && project.previousSecretExpiresAt) {
        if (new Date() < project.previousSecretExpiresAt) {
          isValid = await this.crypto.verifyApiSecret(apiSecret, project.previousSecretHash);
        }
      }

      if (isValid) {
        // Cache verified credential for 60 seconds (mitigates CPU DoS)
        ApiKeyGuard.verifiedCache.set(cacheKey, {
          expiresAt: now + 60 * 1000,
          projectId: project.id,
        });
        // Clear failures on success
        ApiKeyGuard.failureTracker.delete(apiKey);
      }
    }

    if (!isValid) {
      this.recordFailure(apiKey);
      throw new UnauthorizedException('Invalid API credentials');
    }

    // Check Wallet Balance (if production)
    if (project.environment === 'PRODUCTION') {
      const balance = Number(project.organization.walletBalance);
      if (balance <= 0) {
        throw new ForbiddenException(
          'Wallet balance exhausted. Please top up your wallet to continue creating rooms.',
        );
      }
    }

    // Attach project and org to request object for downstream controllers
    request.project = project;
    request.organization = project.organization;

    return true;
  }

  private recordFailure(apiKey: string): void {
    const now = Date.now();
    const tracker = ApiKeyGuard.failureTracker.get(apiKey) || { attempts: 0, lockedUntil: 0 };
    tracker.attempts += 1;

    // Lockout for 5 minutes after 10 failed attempts
    if (tracker.attempts >= 10) {
      tracker.lockedUntil = now + 5 * 60 * 1000;
    }

    ApiKeyGuard.failureTracker.set(apiKey, tracker);
  }
}
