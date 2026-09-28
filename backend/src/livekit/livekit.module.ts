import { Module } from '@nestjs/common';
import { LivekitTokenService } from './livekit-token.service.js';
import { TokensController } from './tokens.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Module({
  controllers: [TokensController],
  providers: [LivekitTokenService, PrismaService],
  exports: [LivekitTokenService],
})
export class LivekitModule {}
