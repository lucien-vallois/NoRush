import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ALLOW_IN_DEMO_KEY } from '../decorators/allow-in-demo.decorator';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const isDemoReadOnly = (config: ConfigService): boolean =>
  config.get<string>('DEMO_READ_ONLY', 'false') === 'true';

/**
 * DEMO_READ_ONLY=true: a public demo with shared accounts, where one visitor
 * must not be able to change or break the setup for the next one.
 *
 * Reads stay open. Writes are refused (403, code `demoReadOnly`) unless the
 * route is public (sign-in, token refresh, device ingestion, so the simulated
 * gauges keep reporting) or marked @AllowInDemo(). Enforced on the server:
 * hiding buttons in the console would not stop a direct API call.
 */
@Injectable()
export class DemoReadOnlyGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.enabled = isDemoReadOnly(config);
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled || context.getType() !== 'http') return true;

    const { method } = context.switchToHttp().getRequest<{ method: string }>();
    if (READ_METHODS.has(method.toUpperCase())) return true;

    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets) ||
      this.reflector.getAllAndOverride<boolean>(ALLOW_IN_DEMO_KEY, targets)
    ) {
      return true;
    }

    throw new ForbiddenException({ code: 'demoReadOnly' });
  }
}
