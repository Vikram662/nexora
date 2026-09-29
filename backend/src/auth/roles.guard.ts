import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_STAFF_KEY = 'require_staff';
export const RequireStaff = () => SetMetadata(REQUIRE_STAFF_KEY, true);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requireStaff = this.reflector.getAllAndOverride<boolean>(REQUIRE_STAFF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User context missing. JwtAuthGuard must be used before RolesGuard.');
    }

    if (requireStaff && !user.isStaff) {
      throw new ForbiddenException('Staff privileges required to access this endpoint.');
    }

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const hasRole = requiredRoles.includes(user.role) || user.isStaff;
    if (!hasRole) {
      throw new ForbiddenException(`Insufficient permissions. Required role: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
