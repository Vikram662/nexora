import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

// After this many failed deliveries in a row, the customer is told their endpoint is failing.
const DEGRADED_AFTER = 5;

export interface DispatchWebhookOptions {
  projectId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

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

  // Dispatches signed HMAC-SHA256 event to all active endpoints subscribed to this event
  async dispatchEvent(options: DispatchWebhookOptions) {
    const { projectId, eventType, payload } = options;

    try {
      const endpoints = await this.prisma.webhookEndpoint.findMany({
        where: {
          projectId,
          isActive: true,
        },
      });

      if (!endpoints.length) return;

      const eventPayload = {
        id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        event: eventType,
        createdAt: new Date().toISOString(),
        data: payload,
      };

      const bodyString = JSON.stringify(eventPayload);

      for (const endpoint of endpoints) {
        // Check if endpoint is subscribed to this event (supports wildcard '*' or explicit event name)
        let subscribedEvents: string[] = [];
        try {
          subscribedEvents = Array.isArray(endpoint.events)
            ? (endpoint.events as string[])
            : JSON.parse(endpoint.events as string);
        } catch {
          subscribedEvents = [];
        }

        const isSubscribed =
          subscribedEvents.includes('*') ||
          subscribedEvents.includes(eventType) ||
          subscribedEvents.some((pattern) => {
            if (pattern.endsWith('.*')) {
              const prefix = pattern.slice(0, -2);
              return eventType.startsWith(prefix);
            }
            return false;
          });

        if (!isSubscribed) continue;

        // Compute HMAC-SHA256 signature
        const timestamp = Math.floor(Date.now() / 1000);
        const signaturePayload = `t=${timestamp},v1=${crypto
          .createHmac('sha256', endpoint.signingSecret)
          .update(`${timestamp}.${bodyString}`)
          .digest('hex')}`;

        // Asynchronous non-blocking HTTP dispatch
        fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Nexora-Webhooks/1.0',
            'Nexora-Signature': signaturePayload,
          },
          body: bodyString,
          signal: AbortSignal.timeout(10000),
        })
          .then(async (res) => {
            await this.prisma.webhookDelivery.create({
              data: {
                endpointId: endpoint.id,
                eventType,
                payload: eventPayload,
                responseCode: res.status,
                succeeded: res.ok,
              },
            });
            if (!res.ok) await this.checkDegraded(endpoint);
          })
          .catch(async (err: any) => {
            this.logger.warn(`Failed to deliver webhook to ${endpoint.url}: ${err.message}`);
            await this.prisma.webhookDelivery.create({
              data: {
                endpointId: endpoint.id,
                eventType,
                payload: eventPayload,
                responseCode: 0,
                succeeded: false,
              },
            });
            await this.checkDegraded(endpoint);
          });
      }
    } catch (err: any) {
      this.logger.error(`Error dispatching webhook event ${eventType}: ${err.message}`, err.stack);
    }
  }
}
