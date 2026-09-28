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
import { LivekitTokenService, TokenGrants } from './livekit-token.service.js';

import { PrismaService } from '../prisma/prisma.service.js';

interface CreateTokenDto {
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  ttlSeconds?: number;
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
    // If Production, deduct participant session fee including 18% GST immediately
    // Base Minute Rate: ₹0.0035/min -> with 18% GST: ₹0.00413/min
    if (project.environment === 'PRODUCTION' && organization) {
      const baseRate = Number(organization.customMinuteRate || 0.0035);
      const gstRatePercent = 18;
      const gstMultiplier = 1 + gstRatePercent / 100; // 1.18
      const effectiveRateWithGst = baseRate * gstMultiplier;

      // Estimate initial 10-minute session block with GST
      const sessionSeconds = Math.min(body.ttlSeconds || 600, 600);
      const sessionMinutes = sessionSeconds / 60;
      const baseDeduction = Number((sessionMinutes * baseRate).toFixed(4));
      const totalDeductionWithGst = Number((sessionMinutes * effectiveRateWithGst).toFixed(4));

      const currentBalance = Number(organization.walletBalance);
      if (currentBalance < totalDeductionWithGst) {
        throw new BadRequestException(
          `Insufficient wallet balance. Minimum ₹${totalDeductionWithGst.toFixed(2)} required (incl. 18% GST). Please recharge your wallet.`,
        );
      }

      // Deduct immediately and record UsageLog so balance never goes negative
      await this.prisma.$transaction([
        this.prisma.organization.update({
          where: { id: organization.id },
          data: {
            walletBalance: { decrement: totalDeductionWithGst },
          },
        }),
        this.prisma.usageLog.create({
          data: {
            projectId: project.id,
            roomName: body.roomName,
            participantIdentity: body.participantIdentity,
            startedAt: new Date(),
            billableSeconds: sessionSeconds,
            ratePerMinute: effectiveRateWithGst,
            amountDeducted: totalDeductionWithGst,
          },
        }),
      ]);
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
