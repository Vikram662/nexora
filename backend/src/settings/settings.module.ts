import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SiteSettingsService } from './site-settings.service.js';
import { PricingService } from './pricing.service.js';
import { PublicSiteController } from './public-site.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [PublicSiteController],
  providers: [SiteSettingsService, PricingService],
  exports: [SiteSettingsService, PricingService],
})
export class SettingsModule {}
