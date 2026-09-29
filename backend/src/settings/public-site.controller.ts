import { Controller, Get, Header } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service.js';

@Controller('v1/public')
export class PublicSiteController {
  constructor(private readonly siteSettings: SiteSettingsService) {}

  @Get('site')
  @Header('Cache-Control', 'public, max-age=60')
  async getSite() {
    return { status: 'success', data: await this.siteSettings.getPublicSite() };
  }
}
