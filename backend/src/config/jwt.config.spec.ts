import { jwtConfig } from './jwt.config';

const configuration = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
  }) as never;
describe('Deployment secrets', () => {
  it('rejects missing secrets in production', () =>
    expect(() =>
      jwtConfig(configuration({ NODE_ENV: 'production' })),
    ).toThrow());
  it('rejects a missing refresh secret even with a strong access secret', () =>
    expect(() =>
      jwtConfig(
        configuration({ NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(64) }),
      ),
    ).toThrow());
  it('rejects shared access and refresh keys', () =>
    expect(() =>
      jwtConfig(
        configuration({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(64),
          JWT_REFRESH_SECRET: 'a'.repeat(64),
        }),
      ),
    ).toThrow());
  it('accepts distinct generated secrets', () =>
    expect(
      jwtConfig(
        configuration({
          NODE_ENV: 'production',
          JWT_SECRET: 'a'.repeat(64),
          JWT_REFRESH_SECRET: 'b'.repeat(64),
        }),
      ).secret,
    ).toBe('a'.repeat(64)));
});
