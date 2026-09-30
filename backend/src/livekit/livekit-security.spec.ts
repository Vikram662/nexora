import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { LivekitWebhookController } from './livekit-webhook.controller.js';
import { RoomsService } from './rooms.service.js';
import { RecordingService } from './recording.service.js';

describe('Livekit Security & Multi-Tenant Isolation Tests', () => {
  describe('1. LivekitWebhookController Signature Verification', () => {
    let controller: LivekitWebhookController;
    let mockConfigService: any;
    let mockRecordingService: any;
    let mockOutboundWebhookService: any;
    let mockPrisma: any;

    beforeEach(() => {
      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'LIVEKIT_API_KEY') return 'test_api_key';
          if (key === 'LIVEKIT_API_SECRET') return 'test_api_secret_32_characters_long_val';
          return null;
        }),
      };

      mockRecordingService = {
        handleLivekitWebhookEvent: vi.fn().mockResolvedValue({ received: true }),
      };

      mockOutboundWebhookService = {
        dispatchTenantWebhook: vi.fn().mockResolvedValue(true),
      };

      mockPrisma = {};

      controller = new LivekitWebhookController(
        mockConfigService as any,
        mockRecordingService as any,
        mockOutboundWebhookService as any,
        mockPrisma as any,
        { markSessionStarted: vi.fn(), settleSession: vi.fn() } as any,
      );
      controller.onModuleInit();
    });

    it('rejects webhooks without Authorization header with 401', async () => {
      const req = { body: { event: 'room_started' } };
      await expect(controller.handleWebhook(req, undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects webhooks with invalid signature header with 401', async () => {
      const req = { body: { event: 'room_started' } };
      await expect(controller.handleWebhook(req, 'Bearer invalid.token.signature')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('2. Multi-Tenant Room Namespacing & Isolation', () => {
    let roomsService: RoomsService;
    let mockConfigService: any;
    let mockPrisma: any;
    let mockLivekitClient: any;

    beforeEach(() => {
      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'LIVEKIT_URL') return 'http://127.0.0.1:7880';
          if (key === 'LIVEKIT_API_KEY') return 'test_key';
          if (key === 'LIVEKIT_API_SECRET') return 'test_secret';
          return null;
        }),
      };

      mockPrisma = {
        project: {
          findUnique: vi.fn().mockResolvedValue({ maxConcurrentRooms: 5 }),
        },
        recording: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
        },
      };

      roomsService = new RoomsService(mockConfigService as any, mockPrisma as any);
      roomsService.onModuleInit();

      mockLivekitClient = {
        createRoom: vi.fn().mockImplementation(async (opts) => ({
          sid: 'RM_123',
          name: opts.name,
          maxParticipants: opts.maxParticipants,
          emptyTimeout: opts.emptyTimeout,
          creationTime: 1700000000,
        })),
        listRooms: vi.fn().mockResolvedValue([
          { name: 'proj_A__meeting_1', sid: 'RM_A1', numParticipants: 2, creationTime: 1700000000 },
          { name: 'proj_B__meeting_1', sid: 'RM_B1', numParticipants: 4, creationTime: 1700000001 },
        ]),
        deleteRoom: vi.fn().mockResolvedValue(undefined),
      };
      (roomsService as any).roomService = mockLivekitClient;
    });

    it('creates rooms strictly with projectId namespace prefix', async () => {
      const res = await roomsService.createRoom({
        projectId: 'proj_A',
        roomName: 'conf-alpha',
      });

      expect(mockLivekitClient.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'proj_A__conf-alpha',
        }),
      );
      expect(res.roomName).toBe('conf-alpha');
    });

    it('filters out other projects rooms so Project A never sees Project B rooms', async () => {
      const rooms = await roomsService.listRooms('proj_A');
      expect(rooms).toHaveLength(1);
      expect(rooms[0].roomName).toBe('meeting_1');
      expect(rooms[0].sid).toBe('RM_A1');
    });

    it('enforces maxConcurrentRooms limit when limit is exceeded', async () => {
      mockLivekitClient.listRooms.mockResolvedValue([
        { name: 'proj_A__room_1', sid: 'R1' },
        { name: 'proj_A__room_2', sid: 'R2' },
        { name: 'proj_A__room_3', sid: 'R3' },
        { name: 'proj_A__room_4', sid: 'R4' },
        { name: 'proj_A__room_5', sid: 'R5' },
      ]);

      await expect(
        roomsService.createRoom({
          projectId: 'proj_A',
          roomName: 'room_new',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('3. Recording Duplicate Prevention & Egress Status Updates', () => {
    let recordingService: RecordingService;
    let mockConfigService: any;
    let mockPrisma: any;
    let mockCrypto: any;

    beforeEach(() => {
      mockConfigService = {
        get: vi.fn((key: string) => {
          if (key === 'LIVEKIT_URL') return 'http://127.0.0.1:7880';
          if (key === 'LIVEKIT_API_KEY') return 'test_key';
          if (key === 'LIVEKIT_API_SECRET') return 'test_secret';
          return null;
        }),
      };

      mockCrypto = {
        decrypt: vi.fn().mockReturnValue(JSON.stringify({ accessKey: 'ak', secretKey: 'sk' })),
      };

      mockPrisma = {
        recording: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        storageConfig: {
          findFirst: vi.fn().mockResolvedValue({
            provider: 'AWS_S3',
            bucketName: 'my-bucket',
            region: 'ap-south-1',
            encryptedAccessKey: 'enc_acc',
            encryptionIv: 'iv',
            encryptionAuthTag: 'tag',
          }),
        },
      };

      recordingService = new RecordingService(
        mockConfigService as any,
        mockPrisma as any,
        mockCrypto as any,
      );
      recordingService.onModuleInit();

      (recordingService as any).egressClient = {
        startRoomCompositeEgress: vi.fn().mockResolvedValue({ egressId: 'egress_123' }),
        stopEgress: vi.fn().mockResolvedValue(undefined),
      };
    });

    it('rejects duplicate recording start if room is already being recorded', async () => {
      mockPrisma.recording.findFirst.mockResolvedValue({
        id: 'rec_existing',
        status: 'PROCESSING',
      });

      await expect(
        recordingService.startRecording({
          projectId: 'proj_1',
          roomName: 'active-consultation',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates recording status to COMPLETED when egress_ended webhook arrives without error', async () => {
      mockPrisma.recording.findUnique.mockResolvedValue({
        id: 'rec_db_1',
        projectId: 'proj_1',
        roomName: 'active-consultation',
        status: 'PROCESSING',
        durationSeconds: 0,
        fileSizeBytes: 0n,
      });

      const event = {
        event: 'egress_ended',
        egressInfo: {
          egressId: 'egress_123',
          roomName: 'proj_1__active-consultation',
          fileResults: [
            {
              duration: 120000000000, // 120s in ns
              size: 5242880,
            },
          ],
        },
      };

      await recordingService.handleEgressWebhook(event);

      expect(mockPrisma.recording.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec_db_1' },
          data: expect.objectContaining({
            status: 'COMPLETED',
            durationSeconds: 120,
            fileSizeBytes: 5242880n,
          }),
        }),
      );
    });

    it('updates recording status to FAILED when egress_ended has error', async () => {
      mockPrisma.recording.findUnique.mockResolvedValue({
        id: 'rec_db_2',
        projectId: 'proj_1',
        roomName: 'active-consultation',
        status: 'PROCESSING',
      });

      const event = {
        event: 'egress_ended',
        egressInfo: {
          egressId: 'egress_123',
          error: 'Transcoder crashed',
        },
      };

      await recordingService.handleEgressWebhook(event);

      expect(mockPrisma.recording.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec_db_2' },
          data: expect.objectContaining({
            status: 'FAILED',
            failureReason: 'Transcoder crashed',
          }),
        }),
      );
    });
  });
});
