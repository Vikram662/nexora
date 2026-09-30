import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { RecordingService } from './recording.service.js';
import { IsBoolean, IsOptional, IsString, IsIn, Matches, MaxLength } from 'class-validator';

export class StartRecordingDto {
  @IsBoolean()
  @IsOptional()
  audioOnly?: boolean;

  @IsString()
  @IsOptional()
  @IsIn([
    'speaker-dark',
    'grid-dark',
    'single-speaker',
    'speaker-light',
    'grid-light',
  ])
  layout?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  @Matches(/^[a-zA-Z0-9_\-/]+(\.(mp4|ogg|webm))?$/, {
    message:
      'customOutputFilename must contain only alphanumeric characters, slashes, hyphens, and underscores, without directory traversal (..) or leading slashes.',
  })
  customOutputFilename?: string;
}

export class StopRecordingDto {
  @IsString()
  @IsOptional()
  egressId?: string;
}

@Controller('v1/rooms/:room/recording')
export class RecordingController {
  constructor(private readonly recordingService: RecordingService) {}

  @Post('start')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async startRecording(
    @Param('room') roomName: string,
    @Body() body: StartRecordingDto,
    @Req() req: any,
  ) {
    const project = req.project;

    const result = await this.recordingService.startRecording({
      projectId: project.id,
      roomName,
      audioOnly: body.audioOnly,
      layout: body.layout,
      customOutputFilename: body.customOutputFilename,
    });

    return {
      status: 'success',
      data: result,
    };
  }

  @Post('stop')
  @UseGuards(ApiKeyGuard)
  @HttpCode(HttpStatus.OK)
  async stopRecording(
    @Param('room') roomName: string,
    @Body() body: StopRecordingDto,
    @Req() req: any,
  ) {
    const project = req.project;

    const result = await this.recordingService.stopRecording(
      project.id,
      roomName,
      body.egressId,
    );

    return {
      status: 'success',
      data: result,
    };
  }

  // Check active recording status for room (returns isRecording boolean flag)
  @Get('status')
  @UseGuards(ApiKeyGuard)
  async getStatus(@Param('room') roomName: string, @Req() req: any) {
    const project = req.project;
    const status = await this.recordingService.getRoomRecordingStatus(
      project.id,
      roomName,
    );

    return {
      status: 'success',
      data: status,
    };
  }
}

@Controller('v1/recordings')
export class RecordingsListController {
  constructor(private readonly recordingService: RecordingService) {}

  @Get()
  @UseGuards(ApiKeyGuard)
  async listRecordings(@Query('roomName') roomName: string | undefined, @Req() req: any) {
    const project = req.project;
    const recordings = await this.recordingService.listRecordings(project.id, roomName);

    return {
      status: 'success',
      data: {
        recordings: recordings.map((r) => ({
          ...r,
          fileSizeBytes: r.fileSizeBytes ? r.fileSizeBytes.toString() : null,
        })),
      },
    };
  }

  @Get(':id')
  @UseGuards(ApiKeyGuard)
  async getRecording(@Param('id') recordingId: string, @Req() req: any) {
    const project = req.project;
    const recording = await this.recordingService.getRecordingById(project.id, recordingId);

    return {
      status: 'success',
      data: recording,
    };
  }
}
