import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from './app.module';
import { User } from './entities/user.entity';
import { Tank } from './entities/tank.entity';
import { Sensor } from './entities/sensor.entity';
import { Reading } from './entities/reading.entity';
import { Alert } from './entities/alert.entity';
import { SeedRepos, seedDatabase } from './seed-data';

/**
 * CLI do seed de demonstração. A lógica fica em seed-data.ts e também roda
 * automaticamente na API quando DEMO_AUTO_SEED=true (banco vazio).
 *
 * Uso: npm run seed        (semeia se o banco estiver vazio)
 *      FORCE_SEED=1 npm run seed   (apaga e semeia novamente)
 *      node dist/seed.js   (ambiente de produção sem ts-node)
 */

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const repos: SeedRepos = {
      userRepo: app.get<Repository<User>>(getRepositoryToken(User)),
      tankRepo: app.get<Repository<Tank>>(getRepositoryToken(Tank)),
      sensorRepo: app.get<Repository<Sensor>>(getRepositoryToken(Sensor)),
      readingRepo: app.get<Repository<Reading>>(getRepositoryToken(Reading)),
      alertRepo: app.get<Repository<Alert>>(getRepositoryToken(Alert)),
    };
    await seedDatabase(repos, { force: process.env.FORCE_SEED === '1' });
  } finally {
    await app.close();
  }
}

seed().catch((err) => {
  console.error('Falha no seed:', err);
  process.exit(1);
});
