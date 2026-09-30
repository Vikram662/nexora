import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { LivekitTokenService } from './livekit-token.service.js';
import type { TokenGrants } from './livekit-token.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BillingService } from './billing.service.js';
import { PricingService, type BillableRoomType } from '../settings/pricing.service.js';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max, IsObject } from 'class-validator';

export class CreateTokenDto {
  @IsString()
  @IsNotEmpty()
  roomName!: string;

  @IsString()
  @IsNotEmpty()
  participantIdentity!: string;

  @IsString()
  @IsOptional()
  participantName?: string;

  @IsInt()
  @Min(30)
  @Max(86400)
  @IsOptional()
  ttlSeconds?: number;

  @IsObject()
  @IsOptional()
  grants?: TokenGrants;
}

@Controller('v1/tokens')
export class TokensController {
  constructor(
    private readonly livekitTokenService: LivekitTokenService,
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly billing: BillingService,
  ) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async createToken(@Body() body: CreateTokenDto, @Req() req: any) {
    const project = req.project;
    const organization = req.organization;
    let deducted = 0;

    // Production sessions are prepaid: rate and GST come from the database, deducted atomically.
    if (project.environment === 'PRODUCTION' && organization) {
      // Room type is derived from the grants, never from client input, so callers cannot pick a cheaper tariff.
      let effectiveRoomType: BillableRoomType = 'VIDEO_CALL';
      if (body.grants?.canPublish === false) {
        effectiveRoomType = 'LIVE_BROADCAST';
      } else if (
        Array.isArray(body.grants?.canPublishSources) &&
        body.grants.canPublishSources.length > 0 &&
        !body.grants.canPublishSources.map((s) => String(s).toLowerCase()).includes('camera')
      ) {
        effectiveRoomType = 'AUDIO_CALL';
      }

      const { ratePerMinuteWithGst, gstPercent } = await this.pricing.resolve(
        organization.id,
        organization.planTier,
        effectiveRoomType,
      );

      // Estimate initial session block with GST
      const sessionSeconds = Math.min(body.ttlSeconds || 600, 600);
      const sessionMinutes = sessionSeconds / 60;
      const totalDeductionWithGst = Number((sessionMinutes * ratePerMinuteWithGst).toFixed(4));

      // Atomic conditional update to eliminate race condition:
      // Decrement wallet balance ONLY if current balance >= totalDeductionWithGst
      const updateResult = await this.prisma.organization.updateMany({
        where: {
          id: organization.id,
          walletBalance: {
            gte: totalDeductionWithGst,
          },
        },
        data: {
          walletBalance: {
            decrement: totalDeductionWithGst,
          },
        },
      });

      if (updateResult.count === 0) {
        throw new BadRequestException(
          `Insufficient wallet balance. Minimum ₹${totalDeductionWithGst.toFixed(2)} required (incl. ${gstPercent}% GST). Please recharge your wallet.`,
        );
      }

      deducted = totalDeductionWithGst;

      // Record UsageLog for session auditing with customer's logical roomName
      try {
        await this.prisma.usageLog.create({
          data: {
            projectId: project.id,
            roomName: body.roomName,
            roomType: effectiveRoomType,
            participantIdentity: body.participantIdentity,
            startedAt: new Date(),
            billableSeconds: sessionSeconds,
            ratePerMinute: ratePerMinuteWithGst,
            amountDeducted: totalDeductionWithGst,
          },
        });
      } catch (err) {
        await this.refund(organization.id, deducted);
        throw err;
      }
    }

    // MULTI-TENANT ISOLATION:
    // LiveKit SFU room names are globally flat across all tenants.
    // Prefix internal room name with projectId so Project A cannot join or spy on Project B's rooms.
    const namespacedLivekitRoom = `${project.id}__${body.roomName}`;

    let result: { token: string; ttl: number };
    try {
      result = await this.livekitTokenService.mintToken({
        projectId: project.id,
        roomName: namespacedLivekitRoom,
        participantIdentity: body.participantIdentity,
        participantName: body.participantName,
        grants: body.grants,
        ttlSeconds: body.ttlSeconds,
        maxTtlSeconds: project.maxTokenTtlSeconds,
      });
    } catch (err) {
      // The wallet was already debited: never charge for a token that was not issued.
      if (deducted > 0) await this.refund(organization.id, deducted);
      throw err;
    }

    if (deducted > 0) void this.billing.checkLowBalance(organization.id);

    // Dynamically resolve LiveKit SFU URL: Environment variable takes priority;
    // otherwise derives dynamically from the incoming request hostname without hardcoded strings
    const hostHeader = req.get ? req.get('host') : (req.headers && req.headers.host);
    const hostName = hostHeader ? hostHeader.split(':')[0] : '127.0.0.1';
    const isTls = req.secure || (req.headers && req.headers['x-forwarded-proto'] === 'https');
    const dynamicLivekitUrl = process.env.LIVEKIT_URL || `${isTls ? 'wss:' : 'ws:'}//${hostName}:7880`;

    return {
      status: 'success',
      data: {
        token: result.token,
        ttlSeconds: result.ttl,
        livekitUrl: dynamicLivekitUrl,
        environment: project.environment,
      },
    };
  }

  private async refund(organizationId: string, amount: number) {
    await this.prisma.organization
      .update({ where: { id: organizationId }, data: { walletBalance: { increment: amount } } })
      .catch(() => undefined);
  }
}
