import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { JwtUserPayload } from './auth.types.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required. Missing bearer token or session cookie.');
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new UnauthorizedException('JWT_SECRET is not configured on server.');
    }

    try {
      const decoded = jwt.verify(token, secret) as JwtUserPayload;
      request.user = decoded;
      return true;
    } catch (err: any) {
      throw new UnauthorizedException('Invalid or expired authentication session');
    }
  }

  private extractToken(request: any): string | null {
    // 1. Check Authorization header: Bearer <token>
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7).trim();
    }

    // 2. Check signed or regular httpOnly cookies
    if (request.cookies && request.cookies.nexora_auth_token) {
      return request.cookies.nexora_auth_token;
    }

    return null;
  }
}
