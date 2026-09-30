import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { MailerService } from './mailer.service.js';
import { NotificationsService } from './notifications.service.js';
import { SmsService } from './sms.service.js';

@Module({
  imports: [SettingsModule],
  providers: [MailerService, SmsService, NotificationsService],
  exports: [MailerService, SmsService, NotificationsService],
})
export class NotificationsModule {}
