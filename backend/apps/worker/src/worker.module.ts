import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../../libs/database/prisma.module.js';
import { CryptoModule } from '../../../libs/crypto/crypto.module.js';
import { AuthModule } from '../../../libs/modules/auth/auth.module.js';
import { SettingsModule } from '../../../libs/modules/settings/settings.module.js';
import { NotificationsModule } from '../../../libs/modules/notifications/notifications.module.js';
import { InvoicingModule } from '../../../libs/modules/invoicing/invoicing.module.js';
import { LivekitModule } from '../../../libs/modules/livekit/livekit.module.js';
import { PortalModule } from '../../../libs/modules/portal/portal.module.js';
import { validateEnv } from '../../../libs/config/env.validation.js';

// Same modules as the api, without HTTP. The services start their repeating jobs here:
// email/SMS queue, webhook retries, auto recharge, monthly invoices, recording reconciliation.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    CryptoModule,
    AuthModule,
    SettingsModule,
    NotificationsModule,
    InvoicingModule,
    LivekitModule,
    PortalModule,
  ],
})
export class WorkerModule {}
