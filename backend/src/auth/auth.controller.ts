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
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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

    // Set secure httpOnly cookie (24 hour lifetime)
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('nexora_auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    // Delete redundant, client-writable nexora_user_role cookie
    res.clearCookie('nexora_user_role', { path: '/' });

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

    const isProd = process.env.NODE_ENV === 'production';
    res.cookie('nexora_auth_token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.clearCookie('nexora_user_role', { path: '/' });

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
    res.clearCookie('nexora_auth_token', { path: '/' });
    res.clearCookie('nexora_user_role', { path: '/' });
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
