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

      // Record UsageLog for session auditing
      await this.prisma.usageLog.create({
        data: {
          projectId: project.id,
          roomName: body.roomName,
          roomType: 'AUDIO_CALL',
          participantIdentity: body.participantIdentity,
          startedAt: new Date(),
          billableSeconds: sessionSeconds,
          ratePerMinute: effectiveRateWithGst,
          amountDeducted: totalDeductionWithGst,
        },
      });
    }

    const result = await this.livekitTokenService.mintToken({
      projectId: project.id,
      roomName: body.roomName,
      participantIdentity: body.participantIdentity,
      participantName: body.participantName,
      grants: body.grants,
      ttlSeconds: body.ttlSeconds,
      maxTtlSeconds: project.maxTokenTtlSeconds,
    });

    return {
      status: 'success',
      data: {
        token: result.token,
        ttlSeconds: result.ttl,
        livekitUrl: process.env.LIVEKIT_URL || 'ws://localhost:7880',
        environment: project.environment,
      },
    };
  }
}
