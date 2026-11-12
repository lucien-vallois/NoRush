import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { Tank, TankStatus, TankArqueacao } from './entities/tank.entity';
import {
  Sensor,
  SensorType,
  SensorProtocol,
  SensorStatus,
} from './entities/sensor.entity';
import { Reading } from './entities/reading.entity';
import { Alert } from './entities/alert.entity';

export interface SeedRepos {
  userRepo: Repository<User>;
  tankRepo: Repository<Tank>;
  sensorRepo: Repository<Sensor>;
  readingRepo: Repository<Reading>;
  alertRepo: Repository<Alert>;
}

const TANK_HEIGHT = 5; // metros
const TANK_DIAMETER = 3.2; // metros

function buildArqueacao(): TankArqueacao[] {
  const radius = TANK_DIAMETER / 2;
  const area = Math.PI * radius * radius; // m²
  const table: TankArqueacao[] = [];
  for (let level = 0; level <= TANK_HEIGHT; level += 0.5) {
    table.push({
      level: Math.round(level * 1000) / 1000,
      volume: Math.round(area * level * 1000), // litros
    });
  }
  return table;
}

const TANKS = [
  {
    code: 'FK-01',
    name: 'Flowback Tank 01',
    lat: 47.98,
    lng: -103.42,
    status: TankStatus.ACTIVE,
    level: 1.85,
  },
  {
    code: 'FK-02',
    name: 'Flowback Tank 02',
    lat: 47.9795,
    lng: -103.4194,
    status: TankStatus.ACTIVE,
    level: 2.4,
  },
  {
    code: 'FK-03',
    name: 'Flowback Tank 03',
    lat: 47.9806,
    lng: -103.4188,
    status: TankStatus.ACTIVE,
    level: 0.9,
  },
  {
    code: 'FK-04',
    name: 'Flowback Tank 04',
    lat: 47.9803,
    lng: -103.4209,
    status: TankStatus.ACTIVE,
    level: 3.1,
  },
  {
    code: 'FK-05',
    name: 'Flowback Tank 05',
    lat: 47.979,
    lng: -103.4203,
    status: TankStatus.ACTIVE,
    level: 4.35,
  },
  {
    code: 'FK-06',
    name: 'Flowback Tank 06',
    lat: 47.981,
    lng: -103.4197,
    status: TankStatus.MAINTENANCE,
    level: 0.25,
  },
];

/**
 * Seed de demonstração: usuários de demonstração, tanques com tabela de
 * arqueação (cilindro 5m x 3.2m) e uma haste magnetostritiva de duas boias
 * por tanque (nível total + interface óleo/água).
 *
 * Idempotente: não faz nada se já houver tanques, a menos que `force` seja
 * true (apaga e semeia novamente).
 */
export async function seedDatabase(
  repos: SeedRepos,
  options: { force?: boolean } = {},
): Promise<void> {
  const logger = new Logger('Seed');
  const { userRepo, tankRepo, sensorRepo, readingRepo, alertRepo } = repos;
  const force = options.force === true;

  const existing = await tankRepo.count();
  if (existing > 0 && !force) {
    logger.log(
      'Banco já possui dados. Use FORCE_SEED=1 npm run seed para re-semear.',
    );
    return;
  }

  if (force) {
    logger.log('FORCE_SEED=1 — limpando dados existentes...');
    // queryBuilder delete() em vez de delete({}): TypeORM 0.3 não permite criteria vazio
    await readingRepo.createQueryBuilder().delete().execute();
    await alertRepo.createQueryBuilder().delete().execute();
    await sensorRepo.createQueryBuilder().delete().execute();
    await tankRepo.createQueryBuilder().delete().execute();
    await userRepo.createQueryBuilder().delete().execute();
  }

  // Usuários de demonstração
  const adminHash = await bcrypt.hash('admin123', 12);
  const operatorHash = await bcrypt.hash('operador123', 12);
  await userRepo.save([
    userRepo.create({
      email: 'admin@flowback.com',
      name: 'Demo Administrator',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      isActive: true,
    }),
    userRepo.create({
      email: 'operador@flowback.com',
      name: 'Field Operator',
      passwordHash: operatorHash,
      role: UserRole.OPERATOR,
      isActive: true,
    }),
  ]);

  // Tanques + sensores
  const arqueacao = buildArqueacao();
  const sensors: Partial<Sensor>[] = [];
  let sensorSeq = 1;

  for (const t of TANKS) {
    const tank = tankRepo.create({
      code: t.code,
      name: t.name,
      description: `Cylindrical flowback tank ${TANK_HEIGHT} m x ${TANK_DIAMETER} m — ${t.code}`,
      dimensions: {
        height: TANK_HEIGHT,
        diameter: TANK_DIAMETER,
        volume: Math.round(
          Math.PI * (TANK_DIAMETER / 2) ** 2 * TANK_HEIGHT * 1000,
        ),
      },
      arqueacaoTable: arqueacao,
      latitude: t.lat,
      longitude: t.lng,
      status: t.status,
      maxLevelThreshold: 4.2,
      minLevelThreshold: 0.3,
      overflowThreshold: 4.6,
      lowLevelThreshold: 0.5,
      installationDate: new Date('2025-08-15'),
    });
    const savedTank = await tankRepo.save(tank);

    // Haste magnetostritiva de duas boias (float stick): uma por tanque,
    // reporta nível total + interface óleo/água ( SENSOR-001 ... SENSOR-006 )
    const sensorId = `SENSOR-${String(sensorSeq).padStart(3, '0')}`;
    sensors.push(
      sensorRepo.create({
        sensorId,
        name: `Float Stick — Level & Interface (${t.code})`,
        type: SensorType.MAGNETOSTRICTIVE,
        protocol: SensorProtocol.MQTT,
        model: 'MAG-2F (simulated)',
        manufacturer: 'Simulated device',
        firmwareVersion: '1.0.0',
        tankId: savedTank.id,
        status:
          t.status === TankStatus.MAINTENANCE
            ? SensorStatus.MAINTENANCE
            : SensorStatus.ACTIVE,
        // SENSOR-004 (FK-04) com bateria crítica para o dashboard
        batteryLevel: sensorId === 'SENSOR-004' ? 12 : 68 + Math.random() * 30,
        batteryLastUpdate: new Date(),
        measurementRangeMin: 0,
        measurementRangeMax: TANK_HEIGHT,
        accuracy: 0.001,
        installationDate: new Date('2025-08-20'),
      }),
    );
    sensorSeq += 1;
  }
  await sensorRepo.save(sensors);

  logger.log('Seed concluído:');
  logger.log(
    `  Usuários: admin@flowback.com / admin123 e operador@flowback.com / operador123`,
  );
  logger.log(
    `  Tanques: ${TANKS.length} (c/ arqueação de ${arqueacao.length} pontos)`,
  );
  logger.log(
    `  Sensores: ${sensors.length} (uma haste de duas boias por tanque)`,
  );
}
