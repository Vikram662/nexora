import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { WebhookReceiver } from 'livekit-server-sdk';
import { RecordingService } from './recording.service.js';
import { OutboundWebhookService } from './outbound-webhook.service.js';
import { BillingService } from './billing.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@SkipThrottle()
@Controller('v1/webhooks/livekit')
export class LivekitWebhookController implements OnModuleInit {
  private readonly logger = new Logger(LivekitWebhookController.name);
  private receiver!: WebhookReceiver;

  constructor(
    private readonly configService: ConfigService,
    private readonly recordingService: RecordingService,
    private readonly outboundWebhookService: OutboundWebhookService,
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit() {
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!apiKey || !apiSecret) {
      throw new Error(
        'FATAL: LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be configured in environment variables for secure webhook processing.'
      );
    }

    this.receiver = new WebhookReceiver(apiKey, apiSecret);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: any,
    @Headers('authorization') authHeader?: string,
  ) {
    if (!authHeader) {
      this.logger.warn('Rejected LiveKit webhook: Missing Authorization signature header.');
      throw new UnauthorizedException('Missing Authorization signature header');
    }

    // 1. Extract exact raw body string for cryptographic signature validation
    let rawBody = '';
    if (typeof req.body === 'string') {
      rawBody = req.body;
    } else if (Buffer.isBuffer(req.rawBody)) {
      rawBody = req.rawBody.toString('utf-8');
    } else {
      rawBody = JSON.stringify(req.body);
    }

    let event: any;
    try {
      event = await this.receiver.receive(rawBody, authHeader);
    } catch (err: any) {
      this.logger.error(`LiveKit webhook signature validation failed: ${err.message}`);
      throw new UnauthorizedException(`Invalid webhook signature: ${err.message}`);
    }

    if (!event || !event.event) {
      return { received: true };
    }

    const eventName = event.event as string;
    this.logger.log(`Processing LiveKit Webhook event: ${eventName}`);

    // Extract room information and isolate project namespace
    const fullRoomName = event.room?.name || '';
    let projectId = '';
    let logicalRoomName = fullRoomName;

    if (fullRoomName.includes('__')) {
      const parts = fullRoomName.split('__');
      projectId = parts[0];
      logicalRoomName = parts.slice(1).join('__');
    }

    // 2. Handle Egress (Recording) Lifecycle Events
    if (eventName.startsWith('egress_')) {
      const egressId = event.egressInfo?.egressId;
      if (egressId) {
        // Update database recording status and duration/size
        await this.recordingService.handleEgressWebhook(event);

        // Fetch recording to find which project owns this recording
        const rec = await this.prisma.recording.findUnique({
          where: { livekitEgressId: egressId },
        });

        if (rec) {
          const customerEventType =
            eventName === 'egress_started'
              ? 'recording.started'
              : eventName === 'egress_ended'
              ? rec.status === 'FAILED'
                ? 'recording.failed'
                : 'recording.completed'
              : 'recording.updated';

          await this.outboundWebhookService.dispatchEvent({
            projectId: rec.projectId,
            eventType: customerEventType,
            payload: {
              recordingId: rec.id,
              egressId: rec.livekitEgressId,
              roomName: rec.roomName,
              status: rec.status,
              storageProvider: rec.storageProvider,
              bucketName: rec.bucketName,
              objectKey: rec.objectKey,
              durationSeconds: rec.durationSeconds,
              fileSizeBytes: rec.fileSizeBytes ? rec.fileSizeBytes.toString() : null,
              failureReason: rec.failureReason,
            },
          });
        }
      }
      return { received: true };
    }

    // 3. Handle Room Lifecycle Events (room_started, room_finished)
    if (projectId) {
      if (eventName === 'room_started') {
        await this.outboundWebhookService.dispatchEvent({
          projectId,
          eventType: 'room.started',
          payload: {
            roomName: logicalRoomName,
            sid: event.room?.sid,
            creationTime: event.room?.creationTime,
          },
        });
      } else if (eventName === 'room_finished') {
        await this.outboundWebhookService.dispatchEvent({
          projectId,
          eventType: 'room.finished',
          payload: {
            roomName: logicalRoomName,
            sid: event.room?.sid,
          },
        });
      }

      // 4. Handle Participant Lifecycle Events (participant_joined, participant_left)
      if (eventName === 'participant_joined') {
        await this.billing
          .markSessionStarted(projectId, logicalRoomName, event.participant?.identity)
          .catch((e) => this.logger.warn(`Billing start failed: ${e.message}`));
        await this.outboundWebhookService.dispatchEvent({
          projectId,
          eventType: 'participant.joined',
          payload: {
            roomName: logicalRoomName,
            identity: event.participant?.identity,
            name: event.participant?.name,
            joinedAt: event.participant?.joinedAt,
          },
        });
      } else if (eventName === 'participant_left') {
        await this.billing
          .settleSession(projectId, logicalRoomName, event.participant?.identity)
          .catch((e) => this.logger.warn(`Billing settlement failed: ${e.message}`));
        await this.outboundWebhookService.dispatchEvent({
          projectId,
          eventType: 'participant.left',
          payload: {
            roomName: logicalRoomName,
            identity: event.participant?.identity,
            name: event.participant?.name,
          },
        });
      }
    }

    return { received: true };
  }
}
