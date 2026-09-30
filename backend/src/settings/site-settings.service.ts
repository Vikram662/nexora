import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PLAN_TIERS,
  RATE_ROOM_TYPES,
  type PlanDisplayDto,
  type PlanTierName,
  type RateRoomType,
  type UpdateSiteSettingsDto,
} from './site-settings.dto.js';

export interface ContactSettings {
  companyName: string;
  email: string;
  phone: string;
  whatsapp: string;
  address: string;
  supportHours: string;
}

export interface BrandSettings {
  siteName: string;
  tagline: string;
  logoUrl: string;
  announcement: string;
}

export interface SocialLinks {
  linkedin: string;
  twitter: string;
  github: string;
  youtube: string;
}

export interface BillingSettings {
  gstPercent: number;
  sacCode: string;
  // Who issues the tax invoices. Managed in Admin Settings; blank until an admin fills it in.
  supplierLegalName: string;
  supplierGstin: string;
  supplierStateCode: string;
  supplierAddress: string;
}

export type PlanDisplay = Omit<PlanDisplayDto, never>;

export type RateTable = Record<PlanTierName, Partial<Record<RateRoomType, number>>>;

export interface PublicPlan extends PlanDisplay {
  videoRatePerMinute: number | null;
}

export interface SiteSettingsSnapshot {
  contact: ContactSettings;
  brand: BrandSettings;
  social: SocialLinks;
  billing: BillingSettings;
  plans: PlanDisplay[];
  rates: RateTable;
}

const KEYS = { contact: 'contact', brand: 'brand', social: 'social', billing: 'billing', plans: 'plans' } as const;

export const DEFAULT_CONTACT: ContactSettings = { companyName: '', email: '', phone: '', whatsapp: '', address: '', supportHours: '' };
export const DEFAULT_BRAND: BrandSettings = { siteName: 'Nexora', tagline: '', logoUrl: '', announcement: '' };
export const DEFAULT_SOCIAL: SocialLinks = { linkedin: '', twitter: '', github: '', youtube: '' };
export const DEFAULT_BILLING: BillingSettings = {
  gstPercent: 18,
  sacCode: '998314',
  supplierLegalName: '',
  supplierGstin: '',
  supplierStateCode: '',
  supplierAddress: '',
};
export const DEFAULT_PLANS: PlanDisplay[] = [
  { tier: 'STARTER', name: 'Starter', platformFee: '₹0 / month', maxRooms: '10', maxParticipants: '12', includes: 'S3, R2 or GCS recording export' },
  { tier: 'GROWTH', name: 'Growth', platformFee: '₹4,999 / month', maxRooms: '100', maxParticipants: '50', includes: 'Broadcast rooms, priority TURN' },
  { tier: 'ENTERPRISE', name: 'Enterprise', platformFee: 'By quote', maxRooms: 'Agreed', maxParticipants: 'Agreed', includes: 'Dedicated nodes, SLA and DPA' },
];

@Injectable()
export class SiteSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async readAll(): Promise<Map<string, unknown>> {
    const rows = await this.prisma.siteSetting.findMany();
    return new Map(rows.map((r: any) => [r.key, r.value]));
  }

  async getBilling(): Promise<BillingSettings> {
    const row = await this.prisma.siteSetting.findUnique({ where: { key: KEYS.billing } });
    return { ...DEFAULT_BILLING, ...(row?.value as Partial<BillingSettings> | undefined) };
  }

  async getRates(): Promise<RateTable> {
    const cards = await this.prisma.planRateCard.findMany({
      where: { effectiveFrom: { lte: new Date() } },
      orderBy: { effectiveFrom: 'desc' },
    });
    const table = Object.fromEntries(PLAN_TIERS.map((t) => [t, {}])) as RateTable;
    for (const card of cards) {
      const slot = table[card.planTier as PlanTierName];
      if (slot && slot[card.roomType as RateRoomType] === undefined) {
        slot[card.roomType as RateRoomType] = Number(card.ratePerMinute);
      }
    }
    return table;
  }

  async getSnapshot(): Promise<SiteSettingsSnapshot> {
    const [stored, rates] = await Promise.all([this.readAll(), this.getRates()]);
    return {
      contact: { ...DEFAULT_CONTACT, ...(stored.get(KEYS.contact) as Partial<ContactSettings> | undefined) },
      brand: { ...DEFAULT_BRAND, ...(stored.get(KEYS.brand) as Partial<BrandSettings> | undefined) },
      social: { ...DEFAULT_SOCIAL, ...(stored.get(KEYS.social) as Partial<SocialLinks> | undefined) },
      billing: { ...DEFAULT_BILLING, ...(stored.get(KEYS.billing) as Partial<BillingSettings> | undefined) },
      plans: (stored.get(KEYS.plans) as PlanDisplay[] | undefined) ?? DEFAULT_PLANS,
      rates,
    };
  }

  async getPublicSite(): Promise<{
    brand: BrandSettings;
    contact: ContactSettings;
    social: SocialLinks;
    sacCode: string;
    gstPercent: number;
    plans: PublicPlan[];
  }> {
    const { contact, brand, social, billing, plans, rates } = await this.getSnapshot();
    return {
      brand,
      contact,
      social,
      sacCode: billing.sacCode,
      gstPercent: billing.gstPercent,
      plans: plans.map((plan) => ({ ...plan, videoRatePerMinute: rates[plan.tier]?.VIDEO_CALL ?? null })),
    };
  }

  async update(dto: UpdateSiteSettingsDto): Promise<SiteSettingsSnapshot> {
    const writes = [];

    if (dto.contact) {
      const current = (await this.readAll()).get(KEYS.contact) as Partial<ContactSettings> | undefined;
      writes.push(this.upsert(KEYS.contact, { ...DEFAULT_CONTACT, ...current, ...dto.contact }));
    }
    if (dto.brand || dto.social) {
      const stored = await this.readAll();
      if (dto.brand) {
        writes.push(this.upsert(KEYS.brand, { ...DEFAULT_BRAND, ...(stored.get(KEYS.brand) as object | undefined), ...dto.brand }));
      }
      if (dto.social) {
        writes.push(this.upsert(KEYS.social, { ...DEFAULT_SOCIAL, ...(stored.get(KEYS.social) as object | undefined), ...dto.social }));
      }
    }
    if (dto.billing) {
      writes.push(this.upsert(KEYS.billing, { ...(await this.getBilling()), ...dto.billing }));
    }
    if (dto.plans) {
      writes.push(this.upsert(KEYS.plans, dto.plans));
    }
    const effectiveFrom = new Date();
    for (const rate of dto.rates ?? []) {
      if (!RATE_ROOM_TYPES.includes(rate.roomType)) continue;
      writes.push(
        this.prisma.planRateCard.create({
          data: {
            planTier: rate.planTier,
            roomType: rate.roomType,
            ratePerMinute: rate.ratePerMinute,
            effectiveFrom,
          },
        }),
      );
    }

    if (writes.length) await this.prisma.$transaction(writes);
    return this.getSnapshot();
  }

  private upsert(key: string, value: unknown) {
    const json = value as object;
    return this.prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: json },
      update: { value: json },
    });
  }
}
