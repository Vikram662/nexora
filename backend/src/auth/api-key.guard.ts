import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

interface CacheEntry {
  expiresAt: number;
  projectId: string;
}

interface FailureTracker {
  attempts: number;
  lockedUntil: number;
}

const LOCKOUT_MINUTES = 5;

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
    @Optional() private readonly notifications?: NotificationsService,
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

    // Lockouts are scoped to client IP + key, so a third party who knows a public key
    // cannot lock the real owner out by submitting wrong secrets.
    const trackerKey = `${request.ip ?? 'unknown'}|${apiKey}`;

    // Check rate limit / lockout on key
    const tracker = ApiKeyGuard.failureTracker.get(trackerKey);
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
      this.recordFailure(trackerKey);
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
        ApiKeyGuard.failureTracker.delete(trackerKey);
      }
    }

    if (!isValid) {
      const justLocked = this.recordFailure(trackerKey);
      if (justLocked) {
        void this.notifications?.queueOncePerDay(project.organizationId, 'SECURITY_ALERT', {
          projectName: project.name,
          apiKeyPrefix: apiKey,
          ip: request.ip,
          attempts: ApiKeyGuard.failureTracker.get(trackerKey)?.attempts,
          lockMinutes: LOCKOUT_MINUTES,
        });
      }
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

  /** Records a failed attempt. Returns true when this attempt just locked the key. */
  private recordFailure(trackerKey: string): boolean {
    const now = Date.now();
    const tracker = ApiKeyGuard.failureTracker.get(trackerKey) || { attempts: 0, lockedUntil: 0 };
    tracker.attempts += 1;

    // Lockout for 5 minutes after 10 failed attempts
    let justLocked = false;
    if (tracker.attempts >= 10) {
      justLocked = tracker.lockedUntil <= now;
      tracker.lockedUntil = now + LOCKOUT_MINUTES * 60 * 1000;
    }

    ApiKeyGuard.failureTracker.set(trackerKey, tracker);
    return justLocked;
  }
}
