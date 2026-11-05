import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * Recusa o endpoint quando NODE_ENV=production. Usado nas rotas de teste
 * (ex.: /iot/test/simulate), que fabricam telemetria e não têm razão de
 * existir fora do desenvolvimento.
 */
@Injectable()
export class DevOnlyGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException({ code: 'testEndpointsDisabled' });
    }
    return true;
  }
}
