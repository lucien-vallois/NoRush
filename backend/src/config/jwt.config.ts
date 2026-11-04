import { JwtModuleOptions } from '@nestjs/jwt';
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

export const jwtConfig = (config: ConfigService): JwtModuleOptions => {
  const accessSecret = secret(config, 'JWT_SECRET', 'your-super-secret-key');
  secret(config, 'JWT_REFRESH_SECRET', 'your-refresh-secret-key');
  return {
    secret: accessSecret,
    signOptions: {
      expiresIn: config.get<string>('JWT_EXPIRE', '24h'),
      issuer: 'flowback-iiot-platform',
      audience: 'flowback-users',
    },
  };
};

export const refreshJwtConfig = (config: ConfigService): JwtModuleOptions => ({
  secret: secret(config, 'JWT_REFRESH_SECRET', 'your-refresh-secret-key'),
  signOptions: {
    expiresIn: config.get<string>('JWT_REFRESH_EXPIRE', '7d'),
    issuer: 'flowback-iiot-platform',
    audience: 'flowback-users',
  },
});
