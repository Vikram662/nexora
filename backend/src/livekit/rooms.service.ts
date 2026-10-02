import { Injectable, BadRequestException, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface CreateRoomOptions {
  projectId: string;
  roomName: string;
  maxParticipants?: number;
  emptyTimeout?: number;
  metadata?: Record<string, any> | string;
}

export interface UpdateParticipantPermissionsOptions {
  projectId: string;
  roomName: string;
  identity: string;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
  hidden?: boolean;
}

export interface SendMessageOptions {
  projectId: string;
  roomName: string;
  message: string | Record<string, any>;
  destinationIdentities?: string[];
  topic?: string;
}

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly logger = new Logger(RoomsService.name);
  private roomService!: RoomServiceClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  onModuleInit() {
    const rawUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!rawUrl || !apiKey || !apiSecret) {
      throw new Error(
        'FATAL: LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be explicitly configured in environment variables.'
      );
    }

    const httpHost = rawUrl.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    this.roomService = new RoomServiceClient(httpHost, apiKey, apiSecret);
  }

  /** Health check: an authenticated API call that asks for one room name that never exists. */
  async ping(): Promise<void> {
    await this.roomService.listRooms(['__nexora_health_check__']);
  }

  private getNamespacedRoom(projectId: string, roomName: string): string {
    return `${projectId}__${roomName}`;
  }

  private stripNamespace(projectId: string, internalName: string): string {
    const prefix = `${projectId}__`;
    return internalName.startsWith(prefix) ? internalName.slice(prefix.length) : internalName;
  }

  // 1. Create room explicitly
  async createRoom(options: CreateRoomOptions) {
    const { projectId, roomName, maxParticipants = 100, emptyTimeout = 300, metadata } = options;
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    // Enforce project maxConcurrentRooms limit
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { maxConcurrentRooms: true, name: true, organizationId: true },
    });

    const maxRooms = project?.maxConcurrentRooms ?? 50;
    const activeRooms = await this.roomService.listRooms();
    const projectPrefix = `${projectId}__`;
    const currentProjectRooms = activeRooms.filter((r) => r.name.startsWith(projectPrefix));

    // If room already exists, let createRoom update/return it without violating limit
    const alreadyExists = currentProjectRooms.some((r) => r.name === namespacedRoom);
    if (!alreadyExists && currentProjectRooms.length >= maxRooms) {
      if (project) {
        void this.notifications?.queueOncePerDay(project.organizationId, 'PLAN_LIMIT_REACHED', { projectName: project.name, limit: maxRooms });
      }
      throw new BadRequestException(
        `Project room limit reached (${currentProjectRooms.length}/${maxRooms} active rooms). Please close unused rooms or upgrade your plan.`
      );
    }

    const metaString = typeof metadata === 'object' ? JSON.stringify(metadata) : metadata || '';

    try {
      const room = await this.roomService.createRoom({
        name: namespacedRoom,
        maxParticipants,
        emptyTimeout,
        metadata: metaString,
      });

      return {
        roomName,
        sid: room.sid,
        maxParticipants: room.maxParticipants,
        emptyTimeout: room.emptyTimeout,
        metadata: metaString,
        creationTime: Number(room.creationTime),
      };
    } catch (err: any) {
      this.logger.error(`Failed to create room ${roomName}: ${err.message}`);
      throw new BadRequestException(`Could not create room: ${err.message}`);
    }
  }

  // 2. Get single room details (isActive, isRecording, participantCount)
  async getRoom(projectId: string, roomName: string) {
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      const rooms = await this.roomService.listRooms([namespacedRoom]);
      const room = rooms.find((r) => r.name === namespacedRoom);

      if (!room) {
        return {
          roomName,
          isActive: false,
          participantCount: 0,
          isRecording: false,
        };
      }

      // Check if recording is active for this room in DB
      const activeRec = await this.prisma.recording.findFirst({
        where: { projectId, roomName, status: 'PROCESSING' },
      });

      return {
        roomName,
        sid: room.sid,
        isActive: true,
        participantCount: room.numParticipants,
        isRecording: !!activeRec,
        creationTime: Number(room.creationTime),
        metadata: room.metadata,
      };
    } catch (err: any) {
      throw new BadRequestException(`Could not query room ${roomName}: ${err.message}`);
    }
  }

  // 3. List active rooms for project
  async listRooms(projectId: string) {
    try {
      const allRooms = await this.roomService.listRooms();
      const prefix = `${projectId}__`;

      // Filter strictly to rooms owned by this project
      const projectRooms = allRooms.filter((r) => r.name.startsWith(prefix));

      // Get all active recordings for this project
      const activeRecordings = await this.prisma.recording.findMany({
        where: { projectId, status: 'PROCESSING' },
        select: { roomName: true },
      });
      const activeRecordingRooms = new Set(activeRecordings.map((r) => r.roomName));

      return projectRooms.map((r) => {
        const logicalName = this.stripNamespace(projectId, r.name);
        return {
          roomName: logicalName,
          sid: r.sid,
          participantCount: r.numParticipants,
          isRecording: activeRecordingRooms.has(logicalName),
          creationTime: Number(r.creationTime),
          metadata: r.metadata,
        };
      });
    } catch (err: any) {
      throw new BadRequestException(`Could not list rooms: ${err.message}`);
    }
  }

  // 4. Delete room and disconnect all participants
  async deleteRoom(projectId: string, roomName: string) {
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      await this.roomService.deleteRoom(namespacedRoom);
      return {
        roomName,
        deleted: true,
      };
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      // If room was already closed or not found, it is already deleted (idempotent)
      if (msg.includes('not found') || msg.includes('could not find') || msg.includes('does not exist')) {
        return {
          roomName,
          deleted: true,
        };
      }
      this.logger.error(`Room deletion failed for ${roomName}: ${err.message}`);
      throw new BadRequestException(`Failed to delete room ${roomName}: ${err.message}`);
    }
  }

  // 5. List participants in room
  async listParticipants(projectId: string, roomName: string) {
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      const participants = await this.roomService.listParticipants(namespacedRoom);

      return participants.map((p) => ({
        identity: p.identity,
        name: p.name,
        state: p.state,
        joinedAt: Number(p.joinedAt),
        permission: {
          canPublish: p.permission?.canPublish ?? false,
          canSubscribe: p.permission?.canSubscribe ?? true,
          canPublishData: p.permission?.canPublishData ?? true,
          hidden: p.permission?.hidden ?? false,
        },
        tracks: (p.tracks || []).map((t) => ({
          sid: t.sid,
          type: t.type === 1 ? 'AUDIO' : t.type === 2 ? 'VIDEO' : 'DATA',
          source: t.source === 1 ? 'CAMERA' : t.source === 2 ? 'MICROPHONE' : 'SCREEN_SHARE',
          muted: t.muted,
        })),
        isPublisher: (p.tracks || []).length > 0,
      }));
    } catch (err: any) {
      throw new BadRequestException(`Could not list participants for ${roomName}: ${err.message}`);
    }
  }

  // 6. Remove/Kick participant from room
  async removeParticipant(projectId: string, roomName: string, identity: string) {
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      await this.roomService.removeParticipant(namespacedRoom, identity);
      return {
        roomName,
        identity,
        removed: true,
      };
    } catch (err: any) {
      throw new BadRequestException(`Could not remove participant ${identity}: ${err.message}`);
    }
  }

  // 7. Mute participant track (camera or microphone)
  async muteParticipantTrack(
    projectId: string,
    roomName: string,
    identity: string,
    trackSid: string,
    muted = true,
  ) {
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      await this.roomService.mutePublishedTrack(namespacedRoom, identity, trackSid, muted);
      return {
        roomName,
        identity,
        trackSid,
        muted,
      };
    } catch (err: any) {
      throw new BadRequestException(`Could not mute track ${trackSid}: ${err.message}`);
    }
  }

  // 8. Update participant permissions (e.g. promote viewer to speaker, revoke publishing)
  async updateParticipantPermissions(options: UpdateParticipantPermissionsOptions) {
    const { projectId, roomName, identity, canPublish, canSubscribe, canPublishData, hidden } = options;
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    try {
      const participant = await this.roomService.getParticipant(namespacedRoom, identity);
      const existing = (participant.permission || {}) as Record<string, any>;

      const updated = await this.roomService.updateParticipant(namespacedRoom, identity, {
        permission: {
          canPublish: canPublish ?? existing.canPublish ?? true,
          canSubscribe: canSubscribe ?? existing.canSubscribe ?? true,
          canPublishData: canPublishData ?? existing.canPublishData ?? true,
          hidden: hidden ?? existing.hidden ?? false,
        },
      });

      return {
        roomName,
        identity: updated.identity,
        permissions: {
          canPublish: updated.permission?.canPublish,
          canSubscribe: updated.permission?.canSubscribe,
          canPublishData: updated.permission?.canPublishData,
        },
      };
    } catch (err: any) {
      throw new BadRequestException(`Could not update permissions for ${identity}: ${err.message}`);
    }
  }

  // 9. Send server-to-client reliable message (DataChannel broadcast)
  async sendMessage(options: SendMessageOptions) {
    const { projectId, roomName, message, destinationIdentities = [], topic } = options;
    const namespacedRoom = this.getNamespacedRoom(projectId, roomName);

    const payload =
      typeof message === 'string'
        ? Buffer.from(message, 'utf-8')
        : Buffer.from(JSON.stringify(message), 'utf-8');

    try {
      await this.roomService.sendData(
        namespacedRoom,
        payload,
        DataPacket_Kind.RELIABLE,
        {
          destinationIdentities: destinationIdentities.length > 0 ? destinationIdentities : undefined,
          topic: topic || undefined,
        },
      );

      return {
        roomName,
        sent: true,
        recipientsCount: destinationIdentities.length > 0 ? destinationIdentities.length : 'all',
      };
    } catch (err: any) {
      throw new BadRequestException(`Could not dispatch room message: ${err.message}`);
    }
  }
}
