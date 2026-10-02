import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const REQUIRE_STAFF_KEY = 'require_staff';
/**
 * Staff-only route. With no roles any staff member may call it; with roles only those staff roles may.
 * SUPER_ADMIN may always call it.
 */
export const RequireStaff = (...roles: StaffRole[]) => SetMetadata(REQUIRE_STAFF_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const staffRoles = this.reflector.getAllAndOverride<StaffRole[] | undefined>(REQUIRE_STAFF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User context missing. JwtAuthGuard must be used before RolesGuard.');
    }

    if (staffRoles) {
      if (!user.isStaff) {
        throw new ForbiddenException('Staff privileges required to access this endpoint.');
      }
      if (staffRoles.length > 0 && user.role !== 'SUPER_ADMIN' && !staffRoles.includes(user.role)) {
        throw new ForbiddenException('Your staff role does not have access to this area.');
      }
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
