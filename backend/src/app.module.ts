import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CryptoModule } from './crypto/crypto.module.js';
import { LivekitModule } from './livekit/livekit.module.js';
import { PortalModule } from './portal/portal.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    CryptoModule,
    LivekitModule,
    PortalModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
