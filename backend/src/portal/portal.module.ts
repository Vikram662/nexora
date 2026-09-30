import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller.js';
import { KycGatewayService } from './kyc-gateway.service.js';
import { PaymentService } from './payment.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { CryptoModule } from '../crypto/crypto.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LivekitModule } from '../livekit/livekit.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InvoicingModule } from '../invoicing/invoicing.module.js';
import { SettingsModule } from '../settings/settings.module.js';

@Module({
  imports: [PrismaModule, CryptoModule, AuthModule, SettingsModule, InvoicingModule, NotificationsModule, LivekitModule],
  controllers: [PortalController],
  providers: [KycGatewayService, PaymentService],
  exports: [KycGatewayService, PaymentService],
})
export class PortalModule {}
