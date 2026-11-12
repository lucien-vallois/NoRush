import { JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

function secret(config: ConfigService, key: string, fallback: string): string {
  const value = config.get<string>(key, fallback);
  if (
    typeof value !== 'string' ||
    (config.get('NODE_ENV') === 'production' &&
      (value.length < 32 ||
        value === fallback ||
        /replace-with|your-|change-in-production/i.test(value)))
  ) {
    throw new Error(
      `${key} must contain a unique secret of at least 32 characters`,
    );
  }
  if (
    config.get('NODE_ENV') === 'production' &&
    config.get('JWT_SECRET') === config.get('JWT_REFRESH_SECRET')
  ) {
    throw new Error('Access and refresh secrets must be different');
  }
  return value;
}

/**
 * Token lifetime from the environment ("15m", "1h", "7d"; a bare number is
 * milliseconds, as in jsonwebtoken). The library types only accept `ms`
 * literals, which a value read from the environment cannot be statically.
 */
export const tokenLifetime = (
  config: ConfigService,
  key: 'JWT_EXPIRE' | 'JWT_REFRESH_EXPIRE',
  fallback: string,
): JwtSignOptions['expiresIn'] =>
  config.get<string>(key, fallback) as JwtSignOptions['expiresIn'];

export const jwtConfig = (config: ConfigService): JwtModuleOptions => {
  const accessSecret = secret(config, 'JWT_SECRET', 'your-super-secret-key');
  secret(config, 'JWT_REFRESH_SECRET', 'your-refresh-secret-key');
  return {
    secret: accessSecret,
    signOptions: {
      expiresIn: tokenLifetime(config, 'JWT_EXPIRE', '24h'),
      issuer: 'flowback-iiot-platform',
      audience: 'flowback-users',
    },
  };
};

export const refreshJwtConfig = (config: ConfigService): JwtModuleOptions => ({
  secret: secret(config, 'JWT_REFRESH_SECRET', 'your-refresh-secret-key'),
  signOptions: {
    expiresIn: tokenLifetime(config, 'JWT_REFRESH_EXPIRE', '7d'),
    issuer: 'flowback-iiot-platform',
    audience: 'flowback-users',
  },
});
