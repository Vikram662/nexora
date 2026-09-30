import { Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertPublicWebhookUrl } from './webhook-url.js';

// After this many failed deliveries in a row, the customer is told their endpoint is failing.
const DEGRADED_AFTER = 5;
// The first try plus four retries. Seconds to wait after each failed attempt: 1 minute, 5 minutes, 30 minutes, 2 hours.
export const MAX_ATTEMPTS = 5;
export const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200];
const RETRY_TICK_MS = 30 * 1000;
const RETRY_BATCH = 20;
const REQUEST_TIMEOUT_MS = 10 * 1000;

export interface DispatchWebhookOptions {
  projectId: string;
  eventType: string;
  payload: Record<string, any>;
}

interface DeliveryRow {
  id: string;
  eventType: string;
  payload: unknown;
  attempt: number;
  endpoint: { id: string; url: string; signingSecret: string; projectId: string };
}

export interface DeliveryResult {
  succeeded: boolean;
  responseCode: number;
  error: string | null;
  attempt: number;
  nextRetryAt: Date | null;
}

@Injectable()
export class OutboundWebhookService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboundWebhookService.name);
  private timer?: ReturnType<typeof setInterval>;
  private retrying = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit() {
    if (process.env.WEBHOOK_RETRY_AUTO === 'false') return;
    this.timer = setInterval(() => void this.processRetries().catch((e) => this.logger.warn(`Retry run failed: ${e.message}`)), RETRY_TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Tells the customer once a day when the last DEGRADED_AFTER deliveries to an endpoint all failed. */
  async checkDegraded(endpoint: { id: string; url: string; projectId: string }) {
    try {
      const recent = await this.prisma.webhookDelivery.findMany({
        where: { endpointId: endpoint.id },
        orderBy: { createdAt: 'desc' },
        take: DEGRADED_AFTER,
        select: { succeeded: true },
      });
      if (recent.length < DEGRADED_AFTER || recent.some((d) => d.succeeded)) return;
      const project = await this.prisma.project.findUnique({ where: { id: endpoint.projectId }, select: { name: true, organizationId: true } });
      if (!project) return;
      await this.notifications?.queueOncePerDay(project.organizationId, 'WEBHOOK_ENDPOINT_DEGRADED', { url: endpoint.url, projectName: project.name });
    } catch (err: any) {
      this.logger.warn(`Webhook health check failed: ${err.message}`);
    }
  }

  private isSubscribed(events: unknown, eventType: string): boolean {
    let subscribed: string[] = [];
    try {
      subscribed = Array.isArray(events) ? (events as string[]) : JSON.parse(events as string);
    } catch {
      subscribed = [];
    }
    return (
      subscribed.includes('*') ||
      subscribed.includes(eventType) ||
      subscribed.some((pattern) => pattern.endsWith('.*') && eventType.startsWith(pattern.slice(0, -2)))
    );
  }

  /** Records one delivery per subscribed endpoint, then sends it in the background. Failed sends are retried later. */
  async dispatchEvent(options: DispatchWebhookOptions) {
    const { projectId, eventType, payload } = options;

    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({ where: { projectId, isActive: true } });
      if (!endpoints.length) return;

      const eventPayload = {
        id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        event: eventType,
        createdAt: new Date().toISOString(),
        data: payload,
      };

      for (const endpoint of endpoints) {
        if (!this.isSubscribed(endpoint.events, eventType)) continue;
        const delivery = await this.prisma.webhookDelivery.create({
          data: { endpointId: endpoint.id, eventType, payload: eventPayload, attempt: 0, succeeded: false },
        });
        void this.attempt({ ...delivery, attempt: 0, endpoint }).catch((e) => this.logger.warn(`Delivery ${delivery.id} failed unexpectedly: ${e.message}`));
      }
    } catch (err: any) {
      this.logger.error(`Error dispatching webhook event ${eventType}: ${err.message}`, err.stack);
    }
  }

  /** Makes one delivery attempt and records the outcome, including when to retry. Never throws for a failed delivery. */
  async attempt(delivery: DeliveryRow): Promise<DeliveryResult> {
    const attempt = delivery.attempt + 1;
    let responseCode = 0;
    let error: string | null = null;
    let succeeded = false;

    try {
      // Checked on every attempt: DNS can change between attempts, and the customer can edit records.
      const url = await assertPublicWebhookUrl(delivery.endpoint.url);
      const bodyString = JSON.stringify(delivery.payload);
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${timestamp},v1=${crypto.createHmac('sha256', delivery.endpoint.signingSecret).update(`${timestamp}.${bodyString}`).digest('hex')}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Nexora-Webhooks/1.0',
          'Nexora-Signature': signature,
          'Nexora-Delivery-Attempt': String(attempt),
        },
        body: bodyString,
        // A redirect could point at a private address, so redirects count as failures.
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      responseCode = res.status;
      succeeded = res.status >= 200 && res.status < 300;
      if (!succeeded) error = res.status >= 300 && res.status < 400 ? `Redirect (${res.status}) is not followed` : `Your server answered ${res.status}`;
    } catch (err: any) {
      error = err?.message ? String(err.message).slice(0, 300) : 'The request failed';
    }

    const delay = !succeeded && attempt < MAX_ATTEMPTS ? RETRY_DELAYS_SECONDS[attempt - 1] : null;
    const nextRetryAt = delay === null ? null : new Date(Date.now() + delay * 1000);
    await this.prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: { attempt, responseCode, succeeded, lastError: error, nextRetryAt },
    });
    if (!succeeded) {
      this.logger.warn(`Webhook ${delivery.eventType} to ${delivery.endpoint.url} failed (attempt ${attempt}): ${error}`);
      await this.checkDegraded(delivery.endpoint);
    }
    return { succeeded, responseCode, error, attempt, nextRetryAt };
  }

  /** Sends every delivery whose retry time has come. Safe to run on several servers at once. */
  async processRetries(now = new Date()): Promise<number> {
    if (this.retrying) return 0;
    this.retrying = true;
    let handled = 0;
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: { succeeded: false, nextRetryAt: { lte: now }, endpoint: { isActive: true } },
        orderBy: { nextRetryAt: 'asc' },
        take: RETRY_BATCH,
        include: { endpoint: { select: { id: true, url: true, signingSecret: true, projectId: true } } },
      });
      for (const row of due) {
        // Claim the row: only the server that clears nextRetryAt gets to send it.
        const claim = await this.prisma.webhookDelivery.updateMany({
          where: { id: row.id, succeeded: false, nextRetryAt: row.nextRetryAt },
          data: { nextRetryAt: null },
        });
        if (claim.count === 0) continue;
        await this.attempt(row);
        handled++;
      }
    } finally {
      this.retrying = false;
    }
    return handled;
  }

  /** Sends a delivery again right now, for a customer who fixed their server. Scoped to the caller's organization. */
  async resend(deliveryId: string, organizationId: string): Promise<DeliveryResult> {
    const row = await this.prisma.webhookDelivery.findFirst({
      where: { id: deliveryId, endpoint: { project: { organizationId } } },
      include: { endpoint: { select: { id: true, url: true, signingSecret: true, projectId: true } } },
    });
    if (!row) throw new NotFoundException('Delivery not found.');
    // Stop any scheduled retry so the same event is not sent twice.
    await this.prisma.webhookDelivery.update({ where: { id: row.id }, data: { nextRetryAt: null } });
    return this.attempt(row);
  }
}
