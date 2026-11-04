import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get<string>('DB_USER', 'flowback_user'),
  password: configService.get<string>('DB_PASS', 'secure_password'),
  database: configService.get<string>('DB_NAME', 'flowback_iot'),
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  // Desenvolvimento: o schema segue as entidades (synchronize).
  // Produção: só migrations, aplicadas ao iniciar a API.
  synchronize: configService.get<string>('NODE_ENV') !== 'production',
  migrationsRun: configService.get<string>('NODE_ENV') === 'production',
  logging: configService.get<string>('NODE_ENV') === 'development',
  ssl:
    configService.get<string>('DB_SSL', 'false') === 'true'
      ? { rejectUnauthorized: true }
      : false,
  extra: {
    max: 20,
    min: 5,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 600000,
  },
});
