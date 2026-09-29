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
  ) {}

  @Post()
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async createToken(@Body() body: CreateTokenDto, @Req() req: any) {
    const project = req.project;
    const organization = req.organization;

    // Strict GST-Inclusive Safety Rule:
    // If Production, deduct participant session fee including 18% GST atomically
    if (project.environment === 'PRODUCTION' && organization) {
      const baseRate = Number(organization.customMinuteRate || 0.0035);
      const gstRatePercent = 18;
      const gstMultiplier = 1 + gstRatePercent / 100; // 1.18
      const effectiveRateWithGst = baseRate * gstMultiplier;

      // Estimate initial session block with GST
      const sessionSeconds = Math.min(body.ttlSeconds || 600, 600);
      const sessionMinutes = sessionSeconds / 60;
      const totalDeductionWithGst = Number((sessionMinutes * effectiveRateWithGst).toFixed(4));

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
          `Insufficient wallet balance. Minimum ₹${totalDeductionWithGst.toFixed(2)} required (incl. 18% GST). Please recharge your wallet.`,
        );
      }

      // Determine effective room type server-side based on actual token grants
      // SECURITY: Do not trust client-supplied body.roomType to prevent tariff spoofing.
      // If the participant has permission to publish video/camera, bill as VIDEO_CALL.
      // If publishing is disabled completely (viewer/listener), classify as LIVE_BROADCAST.
      // If publishing is explicitly restricted to audio/microphone, classify as AUDIO_CALL.
      let effectiveRoomType: 'AUDIO_CALL' | 'VIDEO_CALL' | 'LIVE_BROADCAST' = 'VIDEO_CALL';
      if (body.grants?.canPublish === false) {
        effectiveRoomType = 'LIVE_BROADCAST';
      } else if (
        Array.isArray(body.grants?.canPublishSources) &&
        body.grants.canPublishSources.length > 0 &&
        !body.grants.canPublishSources.map(s => String(s).toLowerCase()).includes('camera')
      ) {
        effectiveRoomType = 'AUDIO_CALL';
      } else {
        effectiveRoomType = 'VIDEO_CALL';
      }

      // Record UsageLog for session auditing with customer's logical roomName
      await this.prisma.usageLog.create({
        data: {
          projectId: project.id,
          roomName: body.roomName,
          roomType: effectiveRoomType,
          participantIdentity: body.participantIdentity,
          startedAt: new Date(),
          billableSeconds: sessionSeconds,
          ratePerMinute: effectiveRateWithGst,
          amountDeducted: totalDeductionWithGst,
        },
      });
    }

    // MULTI-TENANT ISOLATION:
    // LiveKit SFU room names are globally flat across all tenants.
    // Prefix internal room name with projectId so Project A cannot join or spy on Project B's rooms.
    const namespacedLivekitRoom = `${project.id}__${body.roomName}`;

    const result = await this.livekitTokenService.mintToken({
      projectId: project.id,
      roomName: namespacedLivekitRoom,
      participantIdentity: body.participantIdentity,
      participantName: body.participantName,
      grants: body.grants,
      ttlSeconds: body.ttlSeconds,
      maxTtlSeconds: project.maxTokenTtlSeconds,
    });

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
}
