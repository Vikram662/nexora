import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
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

    // Lookup project by apiKeyPrefix
    const project = await this.prisma.project.findUnique({
      where: { apiKeyPrefix: apiKey },
      include: {
        organization: true,
      },
    });

    if (!project) {
      throw new UnauthorizedException('Invalid API Key');
    }

    if (project.isSuspended) {
      throw new ForbiddenException('Project is suspended. Please contact support.');
    }

    // Verify API secret against active hash or previous rotated hash within grace period
    let isValid = await this.crypto.verifyApiSecret(apiSecret, project.apiSecretHash);

    if (!isValid && project.previousSecretHash && project.previousSecretExpiresAt) {
      if (new Date() < project.previousSecretExpiresAt) {
        isValid = await this.crypto.verifyApiSecret(apiSecret, project.previousSecretHash);
      }
    }

    if (!isValid) {
      throw new UnauthorizedException('Invalid API Secret');
    }

    // Check Wallet Balance (if not sandbox)
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
}
