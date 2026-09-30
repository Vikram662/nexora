import { Module } from '@nestjs/common';
import { LivekitTokenService } from './livekit-token.service.js';
import { TokensController } from './tokens.controller.js';
import { RecordingService } from './recording.service.js';
import { RecordingController, RecordingsListController } from './recording.controller.js';
import { RoomsService } from './rooms.service.js';
import { RoomsController } from './rooms.controller.js';
import { BillingService } from './billing.service.js';
import { OutboundWebhookService } from './outbound-webhook.service.js';
import { LivekitWebhookController } from './livekit-webhook.controller.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettingsModule } from '../settings/settings.module.js';

@Module({
  imports: [SettingsModule],
  controllers: [
    TokensController,
    RoomsController,
    RecordingController,
    RecordingsListController,
    LivekitWebhookController,
  ],
  providers: [
    LivekitTokenService,
    RoomsService,
    RecordingService,
    OutboundWebhookService,
    BillingService,
    PrismaService,
  ],
  exports: [LivekitTokenService, RoomsService, RecordingService, OutboundWebhookService],
})
export class LivekitModule {}
