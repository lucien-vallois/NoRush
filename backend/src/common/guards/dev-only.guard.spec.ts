import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { DevOnlyGuard } from './dev-only.guard';

describe('DevOnlyGuard', () => {
  const guard = new DevOnlyGuard();
  // O guard não lê o contexto — qualquer execução serve
  const context = {} as ExecutionContext;
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
  });

  it('allows test endpoints outside production', () => {
    process.env.NODE_ENV = 'development';
    expect(guard.canActivate(context)).toBe(true);
  });

  it('refuses test endpoints in production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
