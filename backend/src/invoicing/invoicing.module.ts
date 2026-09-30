import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { CreditNoteService } from './credit-note.service.js';
import { InvoiceService } from './invoice.service.js';

@Module({
  imports: [PrismaModule, SettingsModule, NotificationsModule],
  providers: [InvoiceService, CreditNoteService],
  exports: [InvoiceService, CreditNoteService],
})
export class InvoicingModule {}
