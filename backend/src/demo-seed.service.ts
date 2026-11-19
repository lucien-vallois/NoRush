import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Tank } from './entities/tank.entity';
import { Sensor } from './entities/sensor.entity';
import { Reading } from './entities/reading.entity';
import { Alert } from './entities/alert.entity';
import { seedDatabase } from './seed-data';

/**
 * Semeia os dados de demonstração na primeira subida quando o banco está
 * vazio (DEMO_AUTO_SEED=true). Produção recusa essa configuração; fora dela,
 * falha no seed vira log sem derrubar a API.
 */
@Injectable()
export class DemoSeedService implements OnModuleInit {
  private readonly logger = new Logger(DemoSeedService.name);

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Tank) private readonly tankRepo: Repository<Tank>,
    @InjectRepository(Sensor) private readonly sensorRepo: Repository<Sensor>,
    @InjectRepository(Reading)
    private readonly readingRepo: Repository<Reading>,
    @InjectRepository(Alert) private readonly alertRepo: Repository<Alert>,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DEMO_AUTO_SEED !== 'true') return;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DEMO_AUTO_SEED cannot be enabled in production');
    }

    try {
      const existing = await this.tankRepo.count();
      if (existing > 0) return;

      this.logger.log(
        'Banco vazio — semeando dados de demonstração (DEMO_AUTO_SEED=true)',
      );
      await seedDatabase({
        userRepo: this.userRepo,
        tankRepo: this.tankRepo,
        sensorRepo: this.sensorRepo,
        readingRepo: this.readingRepo,
        alertRepo: this.alertRepo,
      });
    } catch (error) {
      this.logger.error(
        `Auto-seed de demonstração falhou (a API segue no ar): ${error}`,
      );
    }
  }
}
