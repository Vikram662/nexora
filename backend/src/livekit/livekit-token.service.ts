import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken } from 'livekit-server-sdk';

export interface TokenGrants {
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  roomAdmin?: boolean;
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

@Injectable()
export class LivekitTokenService {
  constructor(private readonly configService: ConfigService) {}

  private get apiKey(): string {
    return this.configService.get<string>('LIVEKIT_API_KEY') || 'devkey';
  }

  private get apiSecret(): string {
    return this.configService.get<string>('LIVEKIT_API_SECRET') || 'nexora_secret_key_32chars_long_2026';
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

    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: grants.canPublish ?? true,
      canSubscribe: grants.canSubscribe ?? true,
      canPublishData: grants.canPublishData ?? true,
      roomAdmin: grants.roomAdmin ?? false,
      roomRecord: grants.recorder ?? false,
      hidden: grants.hidden ?? false,
    });

    const token = await at.toJwt();

    return {
      token,
      ttl: effectiveTtl,
    };
  }
}
