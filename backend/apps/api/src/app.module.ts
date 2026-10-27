import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from '../../../libs/database/prisma.module.js';
import { CryptoModule } from '../../../libs/crypto/crypto.module.js';
import { LivekitModule } from '../../../libs/modules/livekit/livekit.module.js';
import { PortalModule } from '../../../libs/modules/portal/portal.module.js';
import { AuthModule } from '../../../libs/modules/auth/auth.module.js';
import { SettingsModule } from '../../../libs/modules/settings/settings.module.js';
import { validateEnv } from '../../../libs/config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 120, // 120 requests per minute
      },
    ]),
    PrismaModule,
    CryptoModule,
    AuthModule,
    SettingsModule,
    LivekitModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
