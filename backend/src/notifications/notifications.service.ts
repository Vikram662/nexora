import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { SiteSettingsService } from '../settings/site-settings.service.js';
import { MailerService } from './mailer.service.js';
import { buildEmail, type TemplateAttachment } from './notification-templates.js';
import { isRenderableSnapshot, renderInvoiceHtml } from '../invoicing/invoice.render.js';
import { isRenderableCreditNote, renderCreditNoteHtml } from '../invoicing/credit-note.render.js';

const MAX_ATTEMPTS = 3;
const TICK_MS = 30 * 1000;
const BATCH_SIZE = 20;

export type NotificationTypeName =
  | 'WELCOME' | 'KYC_APPROVED' | 'KYC_REJECTED' | 'LOW_BALANCE' | 'INVOICE_GENERATED' | 'PAYMENT_RECEIVED'
  | 'REFUND_PROCESSED' | 'AUTO_RECHARGE_FAILED' | 'WEBHOOK_ENDPOINT_DEGRADED' | 'API_KEY_ROTATED'
  | 'SECURITY_ALERT' | 'PLAN_LIMIT_REACHED';

export interface ProcessResult {
  sent: number;
  failed: number;
  retrying: number;
  skipped?: 'not_configured';
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteSettings: SiteSettingsService,
    private readonly mailer: MailerService,
  ) {}

  onModuleInit() {
    if (process.env.NOTIFICATIONS_AUTO_SEND === 'false') return;
    if (!this.mailer.isConfigured()) {
      this.logger.warn('SMTP is not configured (SMTP_HOST, EMAIL_FROM). Emails will wait in the queue until it is.');
    }
    this.timer = setInterval(() => void this.processQueue().catch((e) => this.logger.warn(`Queue run failed: ${e.message}`)), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Queues an email for an organization. Respects the organization's email preference and never throws,
   * so a notification problem can never break the action that triggered it.
   */
  async queue(organizationId: string, type: NotificationTypeName, payload: Record<string, unknown> = {}, to?: string): Promise<void> {
    try {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { billingEmail: true, notificationPreference: { select: { emailEnabled: true } } },
      });
      if (!org) return;
      if (org.notificationPreference && !org.notificationPreference.emailEnabled) return;
      await this.prisma.notificationLog.create({
        data: { organizationId, type: type as never, channel: 'EMAIL', destination: to || org.billingEmail, status: 'QUEUED', payload: payload as never },
      });
    } catch (err) {
      this.logger.warn(`Could not queue ${type} for ${organizationId}: ${(err as Error).message}`);
    }
  }

  /** Sends queued emails. Failed sends are retried on later runs, then marked FAILED after MAX_ATTEMPTS. */
  async processQueue(): Promise<ProcessResult> {
    const result: ProcessResult = { sent: 0, failed: 0, retrying: 0 };
    if (!this.mailer.isConfigured()) return { ...result, skipped: 'not_configured' };
    if (this.running) return result;
    this.running = true;
    try {
      const pending = await this.prisma.notificationLog.findMany({
        where: { status: 'QUEUED', channel: 'EMAIL' },
        orderBy: { createdAt: 'asc' },
        take: BATCH_SIZE,
      });
      for (const log of pending) {
        // Claim the row so two app instances never send the same email.
        const claim = await this.prisma.notificationLog.updateMany({
          where: { id: log.id, status: 'QUEUED', attempts: log.attempts },
          data: { attempts: { increment: 1 } },
        });
        if (claim.count === 0) continue;

        try {
          const email = await this.compose(log);
          if (!email) {
            await this.prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'FAILED', errorReason: `No email template for ${log.type}.` } });
            result.failed++;
            continue;
          }
          const { messageId } = await this.mailer.send({ to: log.destination, ...email });
          await this.prisma.notificationLog.update({ where: { id: log.id }, data: { status: 'SENT', sentAt: new Date(), providerRef: messageId, errorReason: null } });
          result.sent++;
        } catch (err) {
          const attempts = log.attempts + 1;
          const final = attempts >= MAX_ATTEMPTS;
          await this.prisma.notificationLog.update({
            where: { id: log.id },
            data: { status: final ? 'FAILED' : 'QUEUED', errorReason: (err as Error).message.slice(0, 500) },
          });
          if (final) result.failed++;
          else result.retrying++;
        }
      }
    } finally {
      this.running = false;
    }
    return result;
  }

  private async compose(log: { type: string; organizationId: string; payload: unknown }) {
    const [org, snapshot] = await Promise.all([
      this.prisma.organization.findUnique({ where: { id: log.organizationId }, select: { name: true } }),
      this.siteSettings.getSnapshot(),
    ]);
    const ctx = { siteName: snapshot.brand.siteName || 'Nexora', organizationName: org?.name ?? 'Your organization', appUrl: process.env.APP_URL };
    const payload = { ...((log.payload as Record<string, unknown> | null) ?? {}) };
    let attachment: TemplateAttachment | undefined;

    if (log.type === 'INVOICE_GENERATED' && payload.invoiceId) {
      const invoice = await this.prisma.invoice.findUnique({ where: { id: String(payload.invoiceId) } });
      if (!invoice) throw new Error('The invoice no longer exists.');
      payload.invoiceNumber = invoice.invoiceNumber;
      payload.total = Number(invoice.totalAmount);
      payload.period = `${invoice.periodStart.toISOString().slice(0, 10)} to ${new Date(invoice.periodEnd.getTime() - 1).toISOString().slice(0, 10)}`;
      if (isRenderableSnapshot(invoice.billingSnapshot)) {
        attachment = { filename: `${invoice.invoiceNumber.replace(/\//g, '-')}.html`, content: renderInvoiceHtml(invoice, invoice.billingSnapshot) };
      }
    }
    if (log.type === 'REFUND_PROCESSED' && payload.creditNoteId) {
      const note = await this.prisma.creditNote.findUnique({ where: { id: String(payload.creditNoteId) }, include: { invoice: true } });
      if (!note) throw new Error('The credit note no longer exists.');
      payload.creditNoteNumber = note.creditNoteNumber;
      payload.invoiceNumber = note.invoice.invoiceNumber;
      payload.total = Number(note.totalAmount);
      payload.reason = note.reason;
      if (isRenderableCreditNote(note.snapshot)) {
        attachment = { filename: `${note.creditNoteNumber.replace(/\//g, '-')}.html`, content: renderCreditNoteHtml(note, note.snapshot) };
      }
    }
    return buildEmail(log.type, payload, ctx, attachment);
  }
}
