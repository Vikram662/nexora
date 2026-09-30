import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { InvoiceService } from './invoice.service.js';

@Module({
  imports: [PrismaModule, SettingsModule],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoicingModule {}
