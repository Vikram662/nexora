import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
  BadRequestException,
  Param,
  ForbiddenException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { TeamInviteService, type AcceptedInvite } from '../team/team-invite.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { clearCookieOptions, sessionCookieOptions } from './session-cookie.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly invites: TeamInviteService,
    private readonly prisma: PrismaService,
  ) {}

  private setSessionCookie(res: Response, token: string) {
    res.cookie('nexora_auth_token', token, sessionCookieOptions());
    res.clearCookie('nexora_user_role', clearCookieOptions());
  }

  private startSession(res: Response, accepted: AcceptedInvite) {
    const user = { userId: accepted.userId, email: accepted.email, organizationId: accepted.organizationId, role: accepted.role, isStaff: false };
    const token = this.authService.generateToken(user);
    this.setSessionCookie(res, token);
    return { status: 'success', data: { token, user, organizationName: accepted.organizationName } };
  }

  // What the invitation link is for, so the page can ask for a password or a sign-in.
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('invite/:token')
  async previewInvite(@Param('token') token: string) {
    return { status: 'success', data: await this.invites.preview(token) };
  }

  // Someone with no account sets a password and joins the organization.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('invite/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvite(@Body() body: { token: string; password: string; name?: string }, @Res({ passthrough: true }) res: Response) {
    const accepted = await this.invites.acceptAsNewUser(body.token, body.password, body.name);
    return this.startSession(res, accepted);
  }

  // Someone who already has an account accepts while signed in with the invited address.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('invite/accept-existing')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async acceptInviteExisting(@Body() body: { token: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.user!.isStaff) throw new ForbiddenException('Staff accounts cannot join customer organizations.');
    const accepted = await this.invites.acceptAsExistingUser(body.token, { userId: req.user!.userId, email: req.user!.email });
    return this.startSession(res, accepted);
  }

  @Get('organizations')
  @UseGuards(JwtAuthGuard)
  async listOrganizations(@Req() req: Request) {
    if (req.user!.isStaff) return { status: 'success', data: [] };
    const memberships = await this.prisma.orgMember.findMany({
      where: { userId: req.user!.userId },
      select: { role: true, organization: { select: { id: true, name: true } } },
      orderBy: { invitedAt: 'asc' },
    });
    return {
      status: 'success',
      data: memberships.map((m) => ({ organizationId: m.organization.id, name: m.organization.name, role: m.role, current: m.organization.id === req.user!.organizationId })),
    };
  }

  // Moves the session to another organization the user belongs to.
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async switchOrganization(@Body() body: { organizationId: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.user!.isStaff) throw new ForbiddenException('Staff accounts cannot switch organizations.');
    const membership = await this.prisma.orgMember.findFirst({
      where: { userId: req.user!.userId, organizationId: body.organizationId },
      select: { role: true, organization: { select: { name: true } } },
    });
    if (!membership) throw new BadRequestException('You are not a member of that organization.');
    return this.startSession(res, {
      userId: req.user!.userId,
      email: req.user!.email,
      organizationId: body.organizationId,
      organizationName: membership.organization.name,
      role: membership.role,
    });
  }

  // Strict per-IP throttle: 5 login requests per minute to prevent credential stuffing
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password are required');
    }

    const { token, user } = await this.authService.login(body.email, body.password);

    this.setSessionCookie(res, token);

    return {
      status: 'success',
      data: {
        token,
        user,
      },
    };
  }

  // Strict per-IP throttle: 3 signup requests per minute
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signup(
    @Body() body: { email: string; orgName: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!body.email || !body.password) {
      throw new UnauthorizedException('Email and password are required');
    }

    const { token, user } = await this.authService.signup({
      email: body.email,
      orgName: body.orgName,
      passwordPlain: body.password,
    });

    this.setSessionCookie(res, token);

    return {
      status: 'success',
      data: {
        token,
        user,
      },
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('nexora_auth_token', clearCookieOptions());
    res.clearCookie('nexora_user_role', clearCookieOptions());
    return {
      status: 'success',
      message: 'Logged out successfully',
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() req: Request) {
    return {
      status: 'success',
      data: req.user,
    };
  }
}
