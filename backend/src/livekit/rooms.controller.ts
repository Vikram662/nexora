import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard.js';
import { RoomsService } from './rooms.service.js';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
} from 'class-validator';

export class CreateRoomDto {
  @IsString()
  @IsNotEmpty()
  roomName!: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  maxParticipants?: number;

  @IsInt()
  @Min(10)
  @Max(86400)
  @IsOptional()
  emptyTimeout?: number;

  @IsOptional()
  metadata?: any;
}

export class MuteParticipantDto {
  @IsString()
  @IsNotEmpty()
  trackSid!: string;

  @IsBoolean()
  @IsOptional()
  muted?: boolean;
}

export class UpdatePermissionsDto {
  @IsBoolean()
  @IsOptional()
  canPublish?: boolean;

  @IsBoolean()
  @IsOptional()
  canSubscribe?: boolean;

  @IsBoolean()
  @IsOptional()
  canPublishData?: boolean;

  @IsBoolean()
  @IsOptional()
  hidden?: boolean;
}

export class SendRoomMessageDto {
  @IsNotEmpty()
  message!: string | Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  destinationIdentities?: string[];

  @IsString()
  @IsOptional()
  topic?: string;
}

@Controller('v1/rooms')
@UseGuards(ApiKeyGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // 1. Create Room explicitly
  @Post()
  @HttpCode(HttpStatus.OK)
  async createRoom(@Body() body: CreateRoomDto, @Req() req: any) {
    const project = req.project;
    const room = await this.roomsService.createRoom({
      projectId: project.id,
      roomName: body.roomName,
      maxParticipants: body.maxParticipants,
      emptyTimeout: body.emptyTimeout,
      metadata: body.metadata,
    });

    return {
      status: 'success',
      data: room,
    };
  }

  // 2. List active rooms for project
  @Get()
  async listRooms(@Req() req: any) {
    const project = req.project;
    const rooms = await this.roomsService.listRooms(project.id);

    return {
      status: 'success',
      data: {
        rooms,
      },
    };
  }

  // 3. Get single room details
  @Get(':room')
  async getRoom(@Param('room') roomName: string, @Req() req: any) {
    const project = req.project;
    const room = await this.roomsService.getRoom(project.id, roomName);

    return {
      status: 'success',
      data: room,
    };
  }

  // 4. Delete room (disconnect all participants)
  @Delete(':room')
  async deleteRoom(@Param('room') roomName: string, @Req() req: any) {
    const project = req.project;
    const result = await this.roomsService.deleteRoom(project.id, roomName);

    return {
      status: 'success',
      data: result,
    };
  }

  // 5. List participants in room
  @Get(':room/participants')
  async listParticipants(@Param('room') roomName: string, @Req() req: any) {
    const project = req.project;
    const participants = await this.roomsService.listParticipants(project.id, roomName);

    return {
      status: 'success',
      data: {
        participants,
      },
    };
  }

  // 6. Remove (Kick) participant from room
  @Delete(':room/participants/:id')
  async removeParticipant(
    @Param('room') roomName: string,
    @Param('id') identity: string,
    @Req() req: any,
  ) {
    const project = req.project;
    const result = await this.roomsService.removeParticipant(project.id, roomName, identity);

    return {
      status: 'success',
      data: result,
    };
  }

  // 7. Mute a participant's audio or video track
  @Post(':room/participants/:id/mute')
  @HttpCode(HttpStatus.OK)
  async muteParticipant(
    @Param('room') roomName: string,
    @Param('id') identity: string,
    @Body() body: MuteParticipantDto,
    @Req() req: any,
  ) {
    const project = req.project;
    const result = await this.roomsService.muteParticipantTrack(
      project.id,
      roomName,
      identity,
      body.trackSid,
      body.muted ?? true,
    );

    return {
      status: 'success',
      data: result,
    };
  }

  // 8. Update participant permissions (e.g. raise hand, promote audience to speaker)
  @Patch(':room/participants/:id/permissions')
  async updatePermissions(
    @Param('room') roomName: string,
    @Param('id') identity: string,
    @Body() body: UpdatePermissionsDto,
    @Req() req: any,
  ) {
    const project = req.project;
    const result = await this.roomsService.updateParticipantPermissions({
      projectId: project.id,
      roomName,
      identity,
      canPublish: body.canPublish,
      canSubscribe: body.canSubscribe,
      canPublishData: body.canPublishData,
      hidden: body.hidden,
    });

    return {
      status: 'success',
      data: result,
    };
  }

  // 9. Send server-to-client real-time message (WebRTC DataChannel)
  @Post(':room/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Param('room') roomName: string,
    @Body() body: SendRoomMessageDto,
    @Req() req: any,
  ) {
    const project = req.project;
    const result = await this.roomsService.sendMessage({
      projectId: project.id,
      roomName,
      message: body.message,
      destinationIdentities: body.destinationIdentities,
      topic: body.topic,
    });

    return {
      status: 'success',
      data: result,
    };
  }
}
