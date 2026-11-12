import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { DemoReadOnlyGuard } from './demo-read-only.guard';
import { Public } from '../decorators/public.decorator';
import { AllowInDemo } from '../decorators/allow-in-demo.decorator';

class Routes {
  @Public()
  login() {}

  @AllowInDemo()
  acknowledge() {}

  deleteTank() {}
}

const contextFor = (method: string, handler: keyof Routes) =>
  ({
    getType: () => 'http',
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  }) as never;

const guard = (env: Record<string, string>) =>
  new DemoReadOnlyGuard(new Reflector(), new ConfigService(env));

describe('DemoReadOnlyGuard', () => {
  it('changes nothing when the demo flag is off', () => {
    expect(guard({}).canActivate(contextFor('DELETE', 'deleteTank'))).toBe(
      true,
    );
  });

  describe('with DEMO_READ_ONLY=true', () => {
    const readOnly = guard({ DEMO_READ_ONLY: 'true' });

    it('keeps every read open', () => {
      expect(readOnly.canActivate(contextFor('GET', 'deleteTank'))).toBe(true);
      expect(readOnly.canActivate(contextFor('HEAD', 'deleteTank'))).toBe(true);
    });

    it('refuses setup changes with a translatable code', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        try {
          readOnly.canActivate(contextFor(method, 'deleteTank'));
          throw new Error(`${method} was allowed`);
        } catch (error) {
          expect(error).toBeInstanceOf(ForbiddenException);
          expect((error as ForbiddenException).getResponse()).toEqual({
            code: 'demoReadOnly',
          });
        }
      }
    });

    it('keeps public routes (sign-in, ingestion) and @AllowInDemo routes open', () => {
      expect(readOnly.canActivate(contextFor('POST', 'login'))).toBe(true);
      expect(readOnly.canActivate(contextFor('POST', 'acknowledge'))).toBe(
        true,
      );
    });
  });
});
