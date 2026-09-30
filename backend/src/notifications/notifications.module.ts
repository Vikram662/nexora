import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { MailerService } from './mailer.service.js';
import { NotificationsService } from './notifications.service.js';

@Module({
  imports: [SettingsModule],
  providers: [MailerService, NotificationsService],
  exports: [MailerService, NotificationsService],
})
export class NotificationsModule {}
