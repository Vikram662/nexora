import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteSettingsService } from '../settings/site-settings.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  GST_STATES,
  financialYearOf,
  formatInvoiceNumber,
  monthRange,
  splitInclusiveTotal,
  toPaise,
} from './invoice-math.js';

const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
// Usage that started in the period but never got a leave event is treated as final after this long.
const SETTLEMENT_GRACE_MS = 24 * 60 * 60 * 1000;
const AUTO_RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

const ROOM_TYPE_LABEL: Record<string, string> = {
  VIDEO_CALL: 'Video call sessions',
  AUDIO_CALL: 'Voice call sessions',
  LIVE_BROADCAST: 'Live broadcast sessions',
};

export interface Supplier {
  legalName: string;
  gstin: string;
  address: string;
  stateCode: string;
}

export type InvoiceOutcome =
  | { status: 'created'; organizationId: string; invoiceId: string; invoiceNumber: string }
  | { status: 'exists' | 'no-usage' | 'skipped'; organizationId: string; reason?: string };

export interface InvoiceLine {
  roomType: string;
  description: string;
  quantityMinutes: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
}

export interface InvoiceSnapshot {
  supplier: Supplier & { stateName: string };
  recipient: {
    legalName: string;
    gstin: string | null;
    addressLines: string[];
    stateCode: string;
    stateName: string;
  };
  sacCode: string;
  gstPercent: number;
  placeOfSupply: string;
  reverseCharge: false;
  issuedAt: string;
  lines: InvoiceLine[];
}

@Injectable()
export class InvoiceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvoiceService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteSettings: SiteSettingsService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.INVOICE_AUTO_GENERATE !== 'true') return;
    const run = () => {
      const now = new Date();
      const { start, end } = monthRange(now.getUTCFullYear(), now.getUTCMonth() - 1);
      this.generateForPeriod(start, end, now)
        .then((r) => r.created && this.logger.log(`Auto-generated ${r.created} invoice(s) for ${start.toISOString().slice(0, 7)}`))
        .catch((e) => this.logger.warn(`Automatic invoice run failed: ${e.message}`));
    };
    run();
    this.timer = setInterval(run, AUTO_RUN_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Supplier identity is entered by an admin in Settings (stored in the database). An invoice is never
   * issued with made-up details, so this refuses until the required fields are filled in.
   */
  async getSupplier(): Promise<Supplier> {
    const [billing, { contact }] = await Promise.all([this.siteSettings.getBilling(), this.siteSettings.getSnapshot()]);
    const legalName = billing.supplierLegalName.trim() || contact.companyName.trim();
    const gstin = billing.supplierGstin.trim().toUpperCase();
    const stateCode = billing.supplierStateCode.trim();
    const address = billing.supplierAddress.trim() || contact.address.trim();

    const missing = [
      !legalName && 'legal name',
      !gstin && 'GSTIN',
      !stateCode && 'state code',
      !address && 'address',
    ].filter(Boolean);
    if (missing.length) {
      throw new ServiceUnavailableException(
        `Cannot issue tax invoices yet. Add the company ${missing.join(', ')} in Admin, Settings, Tax invoice details.`,
      );
    }
    if (!GSTIN_PATTERN.test(gstin)) {
      throw new ServiceUnavailableException('The company GSTIN in Settings is not a valid 15-character GSTIN.');
    }
    if (gstin.slice(0, 2) !== stateCode || !GST_STATES[stateCode]) {
      throw new ServiceUnavailableException('The company state code in Settings must be a valid GST state code matching the first two digits of the GSTIN.');
    }
    return { legalName, gstin, address, stateCode };
  }

  async generateForPeriod(start: Date, end: Date, now = new Date()) {
    this.assertPeriodClosed(end, now);
    await this.getSupplier();

    const orgs = await this.prisma.organization.findMany({
      where: { projects: { some: { usageLogs: { some: this.usageFilter(start, end) } } } },
      select: { id: true },
    });

    const outcomes: InvoiceOutcome[] = [];
    for (const org of orgs) {
      try {
        outcomes.push(await this.generateForOrganization(org.id, start, end, now));
      } catch (err) {
        outcomes.push({ status: 'skipped', organizationId: org.id, reason: (err as Error).message });
      }
    }
    return {
      created: outcomes.filter((o) => o.status === 'created').length,
      skipped: outcomes.filter((o) => o.status === 'skipped'),
      outcomes,
    };
  }

  async generateForOrganization(organizationId: string, start: Date, end: Date, now = new Date()): Promise<InvoiceOutcome> {
    this.assertPeriodClosed(end, now);
    const supplier = await this.getSupplier();
    const { gstPercent, sacCode } = await this.siteSettings.getBilling();

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { billingProfile: true },
    });
    if (!org) return { status: 'skipped', organizationId, reason: 'Organization not found' };

    const profile = org.billingProfile;
    if (!profile) {
      return { status: 'skipped', organizationId, reason: 'No billing profile. The customer must add legal name, address and state first.' };
    }
    const recipientStateCode = profile.placeOfSupplyStateCode.trim().slice(0, 2);
    if (!GST_STATES[recipientStateCode]) {
      return { status: 'skipped', organizationId, reason: `Billing profile has an invalid place of supply state code "${profile.placeOfSupplyStateCode}".` };
    }
    const intraState = recipientStateCode === supplier.stateCode;

    const outcome = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.invoice.findUnique({
        where: { organizationId_periodStart_periodEnd: { organizationId, periodStart: start, periodEnd: end } },
        select: { id: true },
      });
      if (existing) return { status: 'exists', organizationId } as InvoiceOutcome;

      const logs = await tx.usageLog.findMany({
        where: { project: { organizationId }, ...this.usageFilter(start, end) },
        select: { id: true, roomType: true, billableSeconds: true, amountDeducted: true },
      });
      if (logs.length === 0) return { status: 'no-usage', organizationId } as InvoiceOutcome;

      const byType = new Map<string, { seconds: number; rupees: number }>();
      for (const log of logs) {
        const bucket = byType.get(log.roomType) ?? { seconds: 0, rupees: 0 };
        bucket.seconds += log.billableSeconds ?? 0;
        bucket.rupees += Number(log.amountDeducted ?? 0);
        byType.set(log.roomType, bucket);
      }

      const lines: InvoiceLine[] = [...byType.entries()].map(([roomType, { seconds, rupees }]) => ({
        roomType,
        description: ROOM_TYPE_LABEL[roomType] ?? roomType,
        quantityMinutes: Math.ceil(seconds / 60),
        ...(({ taxablePaise, cgstPaise, sgstPaise, igstPaise, totalPaise }) => ({ taxablePaise, cgstPaise, sgstPaise, igstPaise, totalPaise }))(
          splitInclusiveTotal(toPaise(rupees), gstPercent, intraState),
        ),
      }));
      const sum = (key: keyof InvoiceLine) => lines.reduce((acc, l) => acc + (l[key] as number), 0);

      const financialYear = financialYearOf(now);
      const counter = await tx.invoiceCounter.upsert({
        where: { financialYear },
        create: { financialYear, lastSerial: 1 },
        update: { lastSerial: { increment: 1 } },
      });
      const invoiceNumber = formatInvoiceNumber(financialYear, counter.lastSerial);

      const snapshot: InvoiceSnapshot = {
        supplier: { ...supplier, stateName: GST_STATES[supplier.stateCode] },
        recipient: {
          legalName: profile.legalBusinessName,
          gstin: profile.gstin || null,
          addressLines: [profile.billingAddressLine1, profile.billingAddressLine2, `${profile.city} ${profile.pincode}`].filter(Boolean) as string[],
          stateCode: recipientStateCode,
          stateName: GST_STATES[recipientStateCode],
        },
        sacCode,
        gstPercent,
        placeOfSupply: `${GST_STATES[recipientStateCode]} (${recipientStateCode})`,
        reverseCharge: false,
        issuedAt: now.toISOString(),
        lines,
      };

      const rupees = (paise: number) => paise / 100;
      const invoice = await tx.invoice.create({
        data: {
          organizationId,
          invoiceNumber,
          periodStart: start,
          periodEnd: end,
          subtotal: rupees(sum('taxablePaise')),
          cgstAmount: rupees(sum('cgstPaise')),
          sgstAmount: rupees(sum('sgstPaise')),
          igstAmount: rupees(sum('igstPaise')),
          totalAmount: rupees(sum('totalPaise')),
          sacCode,
          financialYear,
          serial: counter.lastSerial,
          placeOfSupplyStateCode: recipientStateCode,
          billingSnapshot: snapshot as never,
        },
      });
      await tx.usageLog.updateMany({ where: { id: { in: logs.map((l) => l.id) } }, data: { invoiceId: invoice.id } });

      return { status: 'created', organizationId, invoiceId: invoice.id, invoiceNumber } as InvoiceOutcome;
    });

    if (outcome.status === 'created') {
      await this.notifications?.queue(organizationId, 'INVOICE_GENERATED', { invoiceId: outcome.invoiceId }, profile.invoiceEmail || undefined);
    }
    return outcome;
  }

  private usageFilter(start: Date, end: Date) {
    return { invoiceId: null, startedAt: { gte: start, lt: end }, amountDeducted: { gt: 0 } };
  }

  /** Waits a day past month end so in-flight sessions have been settled before their amounts are frozen. */
  private assertPeriodClosed(periodEnd: Date, now: Date) {
    if (now.getTime() < periodEnd.getTime() + SETTLEMENT_GRACE_MS) {
      throw new ServiceUnavailableException('This billing period is not closed yet. Invoices can be generated 24 hours after the period ends.');
    }
  }
}
