import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { resolveDbEnv } from './db-env';

export const databaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  ...resolveDbEnv((key) => configService.get<string>(key)),
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  // Desenvolvimento: o schema segue as entidades (synchronize).
  // Produção: só migrations, aplicadas ao iniciar a API.
  synchronize: configService.get<string>('NODE_ENV') !== 'production',
  migrationsRun: configService.get<string>('NODE_ENV') === 'production',
  logging: configService.get<string>('NODE_ENV') === 'development',
  extra: {
    max: 20,
    min: 5,
    acquireTimeoutMillis: 60000,
    createTimeoutMillis: 30000,
    idleTimeoutMillis: 600000,
  },
});
