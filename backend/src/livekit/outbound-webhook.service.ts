import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service.js';

export interface DispatchWebhookOptions {
  projectId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

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
        } catch (_) {
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
          });
      }
    } catch (err: any) {
      this.logger.error(`Error dispatching webhook event ${eventType}: ${err.message}`, err.stack);
    }
  }
}
