import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, TrackSource, type VideoGrant } from 'livekit-server-sdk';

export interface TokenGrants {
  canPublish?: boolean;
  canPublishSources?: (string | TrackSource)[];
  canSubscribe?: boolean;
  canPublishData?: boolean;
  roomAdmin?: boolean;
  roomRecord?: boolean;
  recorder?: boolean;
  hidden?: boolean;
}

export interface MintTokenOptions {
  projectId: string;
  roomName: string;
  participantIdentity: string;
  participantName?: string;
  grants?: TokenGrants;
  ttlSeconds?: number;
  maxTtlSeconds?: number;
}

// Convert user-supplied source strings ('camera', 'microphone', etc.) to LiveKit TrackSource enum
function toTrackSource(source: string | TrackSource): TrackSource {
  if (typeof source === 'number') return source;
  const normalized = String(source).toLowerCase().trim();
  switch (normalized) {
    case 'camera':
      return TrackSource.CAMERA;
    case 'microphone':
    case 'mic':
      return TrackSource.MICROPHONE;
    case 'screen_share':
    case 'screenshare':
      return TrackSource.SCREEN_SHARE;
    case 'screen_share_audio':
      return TrackSource.SCREEN_SHARE_AUDIO;
    default:
      return TrackSource.UNKNOWN;
  }
}

@Injectable()
export class LivekitTokenService implements OnModuleInit {
  private apiKey!: string;
  private apiSecret!: string;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const key = this.configService.get<string>('LIVEKIT_API_KEY');
    const secret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!key || !secret) {
      throw new Error(
        'FATAL: LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be explicitly set in environment variables. ' +
        'Refusing to run with insecure hardcoded fallback credentials.'
      );
    }

    this.apiKey = key;
    this.apiSecret = secret;
  }

  async mintToken(options: MintTokenOptions): Promise<{ token: string; ttl: number }> {
    const {
      projectId,
      roomName,
      participantIdentity,
      participantName,
      grants = {},
      ttlSeconds = 600,
      maxTtlSeconds = 1800,
    } = options;

    if (!roomName || !participantIdentity) {
      throw new BadRequestException('roomName and participantIdentity are required');
    }

    // Bound TTL to project's maxTokenTtlSeconds ceiling
    const effectiveTtl = Math.min(ttlSeconds, maxTtlSeconds);

    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantIdentity,
      name: participantName || participantIdentity,
      ttl: effectiveTtl,

      // Metadata round-trips via LiveKit webhooks for attribution
      metadata: JSON.stringify({
        projectId,
        identity: participantIdentity,
        roomName,
      }),
    });

    // Map source filters to strongly typed TrackSource enum instances
    const canPublishSources: TrackSource[] | undefined = grants.canPublishSources?.length
      ? grants.canPublishSources.map(toTrackSource).filter((s) => s !== TrackSource.UNKNOWN)
      : undefined;

    const videoGrant: VideoGrant = {
      room: roomName,
      roomJoin: true,
      canPublish: grants.canPublish ?? true,
      canPublishSources,
      canSubscribe: grants.canSubscribe ?? true,
      canPublishData: grants.canPublishData ?? true,
      roomAdmin: grants.roomAdmin ?? false,
      roomRecord: grants.roomRecord ?? false,
      recorder: grants.recorder ?? false,
      hidden: grants.hidden ?? false,
    };

    at.addGrant(videoGrant);

    const token = await at.toJwt();

    return {
      token,
      ttl: effectiveTtl,
    };
  }
}
