import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { LivekitModule } from './livekit/livekit.module.js';
import { PortalModule } from './portal/portal.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SettingsModule } from './settings/settings.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
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
