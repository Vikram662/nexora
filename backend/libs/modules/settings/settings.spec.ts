import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PricingService } from './pricing.service.js';
import { SiteSettingsService } from './site-settings.service.js';
import { UpdateSiteSettingsDto } from './site-settings.dto.js';

function buildPrisma() {
  return {
    organizationRateOverride: { findUnique: vi.fn().mockResolvedValue(null) },
    planRateCard: {
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn((args: unknown) => Promise.resolve(args)),
    },
    siteSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn((args: unknown) => Promise.resolve(args)),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

describe('PricingService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let pricing: PricingService;

  beforeEach(() => {
    prisma = buildPrisma();
    pricing = new PricingService(prisma as never, new SiteSettingsService(prisma as never));
  });

  it('uses the plan rate card and the stored GST percent', async () => {
    prisma.planRateCard.findFirst.mockResolvedValue({ ratePerMinute: '0.0100' });
    prisma.siteSetting.findUnique.mockResolvedValue({ value: { gstPercent: 12 } });

    const rate = await pricing.resolve('org_1', 'GROWTH', 'VIDEO_CALL');

    expect(rate.baseRatePerMinute).toBe(0.01);
    expect(rate.gstPercent).toBe(12);
    expect(rate.ratePerMinuteWithGst).toBeCloseTo(0.0112, 6);
  });

  it('prefers a per-organization override over the plan rate card', async () => {
    prisma.organizationRateOverride.findUnique.mockResolvedValue({ ratePerMinute: '0.0020' });
    prisma.planRateCard.findFirst.mockResolvedValue({ ratePerMinute: '0.0100' });

    const rate = await pricing.resolve('org_1', 'STARTER', 'AUDIO_CALL');

    expect(rate.baseRatePerMinute).toBe(0.002);
  });

  it('refuses to bill when no rate is configured instead of guessing one', async () => {
    await expect(pricing.resolve('org_1', 'STARTER', 'VIDEO_CALL')).rejects.toThrow(/No VIDEO_CALL rate/);
  });

  it('falls back to 18% GST only when GST was never configured', async () => {
    prisma.planRateCard.findFirst.mockResolvedValue({ ratePerMinute: '0.0100' });

    const rate = await pricing.resolve('org_1', 'STARTER', 'VIDEO_CALL');

    expect(rate.gstPercent).toBe(18);
  });
});

describe('SiteSettingsService', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let service: SiteSettingsService;

  beforeEach(() => {
    prisma = buildPrisma();
    service = new SiteSettingsService(prisma as never);
  });

  it('returns empty contact details by default rather than invented ones', async () => {
    const site = await service.getPublicSite();

    expect(site.contact.email).toBe('');
    expect(site.contact.phone).toBe('');
    expect(site.plans).toHaveLength(3);
  });

  it('shows the latest effective rate per plan on the public plans', async () => {
    prisma.planRateCard.findMany.mockResolvedValue([
      { planTier: 'GROWTH', roomType: 'VIDEO_CALL', ratePerMinute: '0.0400' },
      { planTier: 'GROWTH', roomType: 'VIDEO_CALL', ratePerMinute: '0.0300' },
    ]);

    const site = await service.getPublicSite();

    expect(site.plans.find((p) => p.tier === 'GROWTH')?.videoRatePerMinute).toBe(0.04);
    expect(site.plans.find((p) => p.tier === 'STARTER')?.videoRatePerMinute).toBeNull();
  });

  it('adds a new effective-dated rate row instead of editing history', async () => {
    await service.update({ rates: [{ planTier: 'STARTER', roomType: 'VIDEO_CALL', ratePerMinute: 0.05 }] });

    expect(prisma.planRateCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ planTier: 'STARTER', roomType: 'VIDEO_CALL', ratePerMinute: 0.05 }),
    });
  });

  it('merges partial contact updates with what is already stored', async () => {
    prisma.siteSetting.findMany.mockResolvedValue([{ key: 'contact', value: { email: 'a@b.co', phone: '+91 99999 00000' } }]);

    await service.update({ contact: { address: 'Pune' } });

    expect(prisma.siteSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { value: expect.objectContaining({ email: 'a@b.co', phone: '+91 99999 00000', address: 'Pune' }) },
      }),
    );
  });
});

describe('UpdateSiteSettingsDto validation', () => {
  async function errorsFor(body: object) {
    return validate(plainToInstance(UpdateSiteSettingsDto, body), { whitelist: true, forbidNonWhitelisted: true });
  }

  it('accepts valid contact, brand and social values', async () => {
    const errors = await errorsFor({
      contact: { email: 'help@example.com', phone: '+91 98765 43210' },
      brand: { siteName: 'Nexora', logoUrl: 'https://cdn.example.com/logo.svg' },
      social: { github: 'https://github.com/nexora' },
    });
    expect(errors).toHaveLength(0);
  });

  it('allows clearing a field with an empty string', async () => {
    expect(await errorsFor({ contact: { email: '', phone: '' }, brand: { logoUrl: '' } })).toHaveLength(0);
  });

  it.each([
    ['bad email', { contact: { email: 'not-an-email' } }],
    ['bad phone', { contact: { phone: 'call me' } }],
    ['javascript: logo URL', { brand: { logoUrl: 'javascript:alert(1)' } }],
    ['GST above 100', { billing: { gstPercent: 180 } }],
    ['negative rate', { rates: [{ planTier: 'STARTER', roomType: 'VIDEO_CALL', ratePerMinute: -1 }] }],
    ['unknown plan tier', { rates: [{ planTier: 'FREE', roomType: 'VIDEO_CALL', ratePerMinute: 1 }] }],
  ])('rejects %s', async (_label, body) => {
    expect((await errorsFor(body)).length).toBeGreaterThan(0);
  });
});
