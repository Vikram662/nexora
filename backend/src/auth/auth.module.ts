import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [AuthController],
  providers: [AuthService, ApiKeyGuard, JwtAuthGuard, RolesGuard],
  exports: [AuthService, ApiKeyGuard, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
