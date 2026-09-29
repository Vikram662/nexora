import { Injectable, BadRequestException, NotFoundException, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EgressClient, EncodedFileOutput, S3Upload, GCPUpload } from 'livekit-server-sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../crypto/crypto.service.js';

export interface StartRecordingOptions {
  projectId: string;
  roomName: string;
  audioOnly?: boolean;
  layout?: string;
  customOutputFilename?: string;
}

@Injectable()
export class RecordingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RecordingService.name);
  private egressClient!: EgressClient;
  private reconciliationTimer?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  onModuleInit() {
    const rawUrl = this.configService.get<string>('LIVEKIT_URL');
    const apiKey = this.configService.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.configService.get<string>('LIVEKIT_API_SECRET');

    if (!rawUrl || !apiKey || !apiSecret) {
      throw new Error(
        'FATAL: LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET must be explicitly configured in environment variables. ' +
        'Refusing to run Egress service with hardcoded fallback URLs or credentials.'
      );
    }

    // Convert wss/ws protocol to https/http for LiveKit Twirp RPC calls
    const httpHost = rawUrl.replace(/^wss:\/\//i, 'https://').replace(/^ws:\/\//i, 'http://');
    this.egressClient = new EgressClient(httpHost, apiKey, apiSecret);

    // Schedule automatic stale recording reconciliation every 10 minutes (600,000ms)
    this.reconciliationTimer = setInterval(() => {
      this.reconcileStaleRecordings().catch((err) => {
        this.logger.error(`Periodic stale recording reconciliation failed: ${err.message}`, err.stack);
      });
    }, 10 * 60 * 1000);
    // Unref timer so it does not block Node.js process shutdown
    this.reconciliationTimer.unref();
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
      this.reconciliationTimer = undefined;
    }
  }

  async startRecording(options: StartRecordingOptions) {
    const { projectId, roomName, audioOnly = false, layout = 'speaker-dark', customOutputFilename } = options;

    if (!roomName) {
      throw new BadRequestException('roomName is required to start recording');
    }

    // MULTI-TENANT ISOLATION:
    // LiveKit SFU room names are globally flat. Map client's room to namespaced room.
    const namespacedLivekitRoom = `${projectId}__${roomName}`;

    // PREVENT CONCURRENT DUPLICATE RECORDING:
    // If a recording is currently active / PROCESSING for this room in this project, reject or return existing
    const existingActive = await this.prisma.recording.findFirst({
      where: {
        projectId,
        roomName,
        status: 'PROCESSING',
      },
    });

    if (existingActive) {
      throw new BadRequestException(
        `Recording is already in progress for room "${roomName}" (Egress ID: ${existingActive.livekitEgressId}). Stop existing recording before starting a new one.`
      );
    }

    // 1. Fetch connected BYOS storage config for the project
    const storageConfig = await this.prisma.storageConfig.findFirst({
      where: { projectId, isDefault: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!storageConfig) {
      throw new BadRequestException(
        'No connected storage bucket found for this project. Please configure Amazon S3, Cloudflare R2, or Google Cloud Storage in User Console → Storage.'
      );
    }

    // 2. Decrypt credentials safely (supports unified JSON payload and legacy single-key fallbacks)
    let accessKey = '';
    let secretKey = '';

    try {
      const decryptedRaw = this.crypto.decrypt(
        storageConfig.encryptedAccessKey,
        storageConfig.encryptionIv,
        storageConfig.encryptionAuthTag,
      );

      // Try parsing unified credentials JSON payload
      if (decryptedRaw.startsWith('{') && decryptedRaw.endsWith('}')) {
        const parsed = JSON.parse(decryptedRaw);
        accessKey = parsed.accessKey || '';
        secretKey = parsed.secretKey || '';
      } else {
        // Legacy single-string fallback
        accessKey = decryptedRaw;
        secretKey = this.crypto.decrypt(
          storageConfig.encryptedSecretKey,
          storageConfig.encryptionIv,
          storageConfig.encryptionAuthTag,
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to decrypt storage credentials for config ${storageConfig.id}: ${err.message}`);
      throw new BadRequestException(
        'Failed to authenticate storage bucket credentials. Please re-enter and save your bucket keys in User Console → Storage.'
      );
    }

    // 3. Format destination object key safely
    const timestamp = Date.now();
    const defaultExtension = audioOnly ? 'ogg' : 'mp4';
    let destinationKey: string;

    if (customOutputFilename) {
      // Strip leading slashes to prevent root-relative bucket paths
      const cleanPath = customOutputFilename.replace(/^\/+/, '');
      destinationKey = cleanPath.includes('.') ? cleanPath : `${cleanPath}.${defaultExtension}`;
    } else {
      destinationKey = `recordings/${projectId}/${roomName}/${timestamp}.${defaultExtension}`;
    }

    // 4. Build LiveKit Egress upload configuration based on BYOS provider
    let fileOutput: EncodedFileOutput;

    if (storageConfig.provider === 'AWS_S3') {
      const s3Upload = new S3Upload({
        accessKey,
        secret: secretKey,
        region: storageConfig.region || 'us-east-1',
        bucket: storageConfig.bucketName,
      });
      fileOutput = new EncodedFileOutput({
        filepath: destinationKey,
        output: {
          case: 's3',
          value: s3Upload,
        },
      });
    } else if (storageConfig.provider === 'CLOUDFLARE_R2') {
      if (!storageConfig.endpoint) {
        throw new BadRequestException(
          'Cloudflare R2 storage configuration is missing an endpoint URL. Please update storage settings in User Console → Storage.'
        );
      }
      const r2Upload = new S3Upload({
        accessKey,
        secret: secretKey,
        region: 'auto',
        endpoint: storageConfig.endpoint,
        bucket: storageConfig.bucketName,
        forcePathStyle: true,
      });
      fileOutput = new EncodedFileOutput({
        filepath: destinationKey,
        output: {
          case: 's3',
          value: r2Upload,
        },
      });
    } else if (storageConfig.provider === 'GOOGLE_CLOUD') {
      // For GCS, secretKey contains the complete decrypted service account JSON credentials
      const gcpCredentialsJson = secretKey || accessKey;
      const gcpUpload = new GCPUpload({
        credentials: gcpCredentialsJson,
        bucket: storageConfig.bucketName,
      });
      fileOutput = new EncodedFileOutput({
        filepath: destinationKey,
        output: {
          case: 'gcp',
          value: gcpUpload,
        },
      });
    } else {
      throw new BadRequestException(`Unsupported storage provider: ${storageConfig.provider}`);
    }

    // 5. Trigger RoomCompositeEgress on the namespaced LiveKit room
    let egressInfo;
    try {
      egressInfo = await this.egressClient.startRoomCompositeEgress(
        namespacedLivekitRoom,
        fileOutput,
        {
          layout,
          audioOnly,
        },
      );
    } catch (err: any) {
      this.logger.error(`LiveKit Egress startup failed for room ${namespacedLivekitRoom}: ${err.message}`, err.stack);
      throw new BadRequestException(
        `Failed to start server-side recording: ${err.message || 'LiveKit Egress service unavailable'}`
      );
    }

    // 6. Record recording session metadata in database
    const recordingRecord = await this.prisma.recording.create({
      data: {
        projectId,
        roomName,
        livekitEgressId: egressInfo.egressId,
        storageProvider: storageConfig.provider,
        bucketName: storageConfig.bucketName,
        objectKey: destinationKey,
        status: 'PROCESSING',
        startedAt: new Date(),
      },
    });

    return {
      recordingId: recordingRecord.id,
      egressId: egressInfo.egressId,
      roomName,
      status: 'PROCESSING',
      storageProvider: storageConfig.provider,
      bucketName: storageConfig.bucketName,
      destinationKey,
    };
  }

  async stopRecording(projectId: string, roomName: string, egressId?: string) {
    let recording;
    if (egressId) {
      recording = await this.prisma.recording.findFirst({
        where: { livekitEgressId: egressId, projectId },
      });
    } else {
      recording = await this.prisma.recording.findFirst({
        where: { roomName, projectId, status: 'PROCESSING' },
        orderBy: { startedAt: 'desc' },
      });
    }

    if (!recording) {
      throw new BadRequestException('No active recording found for this room');
    }

    try {
      await this.egressClient.stopEgress(recording.livekitEgressId);
    } catch (err: any) {
      this.logger.error(`Could not send stop signal for egress ${recording.livekitEgressId}: ${err.message}`);
      throw new BadRequestException(`Failed to stop recording on LiveKit Egress worker: ${err.message}`);
    }

    return {
      recordingId: recording.id,
      egressId: recording.livekitEgressId,
      roomName: recording.roomName,
      status: 'STOPPING',
      message: 'Recording stop signal sent. File transcoding and bucket upload in progress.',
    };
  }

  // Get active room recording status (including isRecording boolean flag)
  async getRoomRecordingStatus(projectId: string, roomName: string) {
    const active = await this.prisma.recording.findFirst({
      where: {
        projectId,
        roomName,
        status: 'PROCESSING',
      },
      orderBy: { startedAt: 'desc' },
    });

    return {
      roomName,
      isRecording: !!active,
      activeRecording: active
        ? {
            recordingId: active.id,
            egressId: active.livekitEgressId,
            status: active.status,
            startedAt: active.startedAt,
            bucketName: active.bucketName,
            storageProvider: active.storageProvider,
          }
        : null,
    };
  }

  // List past and active recordings for a project (optionally filtered by roomName)
  async listRecordings(projectId: string, roomName?: string, limit = 50) {
    const where: any = { projectId };
    if (roomName) {
      where.roomName = roomName;
    }

    return this.prisma.recording.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 100),
      select: {
        id: true,
        roomName: true,
        livekitEgressId: true,
        storageProvider: true,
        bucketName: true,
        objectKey: true,
        durationSeconds: true,
        fileSizeBytes: true,
        status: true,
        failureReason: true,
        startedAt: true,
        completedAt: true,
      },
    });
  }

  // Get single recording status and metadata
  async getRecordingById(projectId: string, recordingId: string) {
    const recording = await this.prisma.recording.findFirst({
      where: {
        id: recordingId,
        projectId,
      },
      select: {
        id: true,
        roomName: true,
        livekitEgressId: true,
        storageProvider: true,
        bucketName: true,
        objectKey: true,
        durationSeconds: true,
        fileSizeBytes: true,
        status: true,
        failureReason: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!recording) {
      throw new NotFoundException(`Recording ${recordingId} not found`);
    }

    return {
      ...recording,
      fileSizeBytes: recording.fileSizeBytes ? recording.fileSizeBytes.toString() : null,
    };
  }

  // Process LiveKit Egress Webhook Events (egress_started, egress_updated, egress_ended)
  async handleEgressWebhook(event: {
    event?: string;
    egressInfo?: {
      egressId?: string;
      status?: string | number;
      error?: string;
      fileResults?: Array<{
        filename?: string;
        size?: number;
        duration?: number;
      }>;
      startedAt?: number;
      endedAt?: number;
    };
  }) {
    const egressId = event?.egressInfo?.egressId;
    if (!egressId) return { received: false };

    const recording = await this.prisma.recording.findUnique({
      where: { livekitEgressId: egressId },
    });
    if (!recording) return { received: false, reason: 'unknown_egress' };

    const file = event.egressInfo?.fileResults?.[0];
    const durationSeconds = file?.duration ? Math.round(Number(file.duration) / 1e9) : undefined;
    const fileSizeBytes = file?.size ? BigInt(file.size) : undefined;

    if (event.event === 'egress_ended') {
      const isFailed = !!event.egressInfo?.error;
      await this.prisma.recording.update({
        where: { id: recording.id },
        data: {
          status: isFailed ? 'FAILED' : 'COMPLETED',
          failureReason: event.egressInfo?.error || null,
          durationSeconds: durationSeconds ?? recording.durationSeconds,
          fileSizeBytes: fileSizeBytes ?? recording.fileSizeBytes,
          completedAt: new Date(),
        },
      });
    }

    return { received: true, egressId };
  }

  /**
   * Reconciles stale recordings that got stuck in 'PROCESSING' state
   * (e.g. if the LiveKit Egress worker crashed or webhook dropped).
   * Recordings in PROCESSING older than staleThresholdMinutes are verified with LiveKit or marked FAILED.
   */
  async reconcileStaleRecordings(staleThresholdMinutes = 120): Promise<number> {
    const cutoff = new Date(Date.now() - staleThresholdMinutes * 60 * 1000);
    const staleRecordings = await this.prisma.recording.findMany({
      where: {
        status: 'PROCESSING',
        startedAt: { lt: cutoff },
      },
      take: 50,
    });

    let resolvedCount = 0;
    for (const rec of staleRecordings) {
      try {
        if (this.egressClient && rec.livekitEgressId) {
          const list = await this.egressClient.listEgress({ egressId: rec.livekitEgressId });
          const egress = list.find((e) => e.egressId === rec.livekitEgressId);

          if (!egress || egress.status === 3 /* EGRESS_COMPLETE */) {
            await this.prisma.recording.update({
              where: { id: rec.id },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
              },
            });
            resolvedCount++;
            continue;
          } else if (egress.status === 4 /* EGRESS_FAILED */ || egress.status === 5 /* EGRESS_ABORTED */) {
            await this.prisma.recording.update({
              where: { id: rec.id },
              data: {
                status: 'FAILED',
                failureReason: egress.error || 'LiveKit Egress failed or aborted',
                completedAt: new Date(),
              },
            });
            resolvedCount++;
            continue;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not poll LiveKit egress status for ${rec.livekitEgressId}: ${err.message}`);
      }

      // If still unresolved and older than 4 hours, mark FAILED due to timeout
      const hardTimeoutCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
      if (rec.startedAt < hardTimeoutCutoff) {
        await this.prisma.recording.update({
          where: { id: rec.id },
          data: {
            status: 'FAILED',
            failureReason: 'Recording timed out without completion signal from Egress worker.',
            completedAt: new Date(),
          },
        });
        resolvedCount++;
      }
    }

    return resolvedCount;
  }
}
