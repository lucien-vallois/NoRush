import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // Se não há roles requeridas, permite acesso
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException({ code: 'notAuthenticated' });
    }

    const hasRequiredRole = requiredRoles.some((role) => user.role?.includes(role));

    if (!hasRequiredRole) {
      throw new ForbiddenException(
        `Acesso negado. Roles requeridas: ${requiredRoles.join(', ')}. Role do usuário: ${user.role}`
      );
    }

    return true;
  }
}
