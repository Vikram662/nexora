import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteSettingsService } from './site-settings.service.js';

export type BillableRoomType = 'AUDIO_CALL' | 'VIDEO_CALL' | 'LIVE_BROADCAST';

export interface ResolvedRate {
  baseRatePerMinute: number;
  gstPercent: number;
  ratePerMinuteWithGst: number;
}

@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  // Precedence: per-organization override, then the latest plan rate card in effect. No hardcoded fallback.
  async resolve(organizationId: string, planTier: string, roomType: BillableRoomType): Promise<ResolvedRate> {
    const [override, card, billing] = await Promise.all([
      this.prisma.organizationRateOverride.findUnique({
        where: { organizationId_roomType: { organizationId, roomType } },
      }),
      this.prisma.planRateCard.findFirst({
        where: { planTier: planTier as never, roomType, effectiveFrom: { lte: new Date() } },
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.siteSettings.getBilling(),
    ]);

    const chosen = override?.ratePerMinute ?? card?.ratePerMinute;
    if (chosen === undefined || chosen === null) {
      throw new ServiceUnavailableException(
        `No ${roomType} rate is configured for the ${planTier} plan. Ask the platform admin to set it in Settings.`,
      );
    }

    const baseRatePerMinute = Number(chosen);
    return {
      baseRatePerMinute,
      gstPercent: billing.gstPercent,
      ratePerMinuteWithGst: baseRatePerMinute * (1 + billing.gstPercent / 100),
    };
  }
}
