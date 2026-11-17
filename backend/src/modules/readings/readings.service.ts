import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  SelectQueryBuilder,
  LessThanOrEqual,
  DataSource,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Reading } from '../../entities/reading.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Tank } from '../../entities/tank.entity';
import { CreateReadingDto } from './dto/create-reading.dto';
import {
  ReadingFiltersDto,
  READING_SORT_COLUMNS,
} from './dto/reading-filters.dto';
import { tankLevelSensorSql } from '../tanks/tank-level-sensor.query';

@Injectable()
export class ReadingsService {
  private readonly logger = new Logger(ReadingsService.name);

  constructor(
    @InjectRepository(Reading)
    private readingRepository: Repository<Reading>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    private dataSource: DataSource,
  ) {}

  async create(createReadingDto: CreateReadingDto): Promise<Reading> {
    const { sensorId } = createReadingDto;

    // Verificar se o sensor existe
    const sensor = await this.sensorRepository.findOne({
      where: { id: sensorId },
      relations: { tank: true },
    });

    if (!sensor) {
      throw new NotFoundException({ code: 'sensorNotFound', id: sensorId });
    }

    // Calcular volume se não foi fornecido
    let volume = createReadingDto.volume;
    if (!volume && sensor.tank) {
      volume = sensor.tank.getVolumeFromLevel(createReadingDto.level);
    }

    // Definir timestamp se não foi fornecido
    const timestamp = createReadingDto.timestamp
      ? new Date(createReadingDto.timestamp)
      : new Date();

    const reading = this.readingRepository.create({
      ...createReadingDto,
      id: randomUUID(),
      volume,
      timestamp,
      processedAt: new Date(),
      isCalibrated: createReadingDto.isCalibrated ?? false,
      isProcessed: true,
      quality: createReadingDto.quality ?? 100,
    });

    // insert() em vez de save(): com PK composta, save() interpretaria como update
    await this.readingRepository.insert(reading);

    this.logger.debug(
      `Nova leitura criada: sensor=${sensor.sensorId}, nível=${createReadingDto.level}m, volume=${volume}L`,
    );

    return reading;
  }

  async findAll(filters?: ReadingFiltersDto): Promise<{
    readings: Reading[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryBuilder = this.buildFilteredQuery(filters);

    const total = await queryBuilder.getCount();
    const limit = filters?.limit || 100;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const readings = await queryBuilder.skip(offset).take(limit).getMany();

    return {
      readings,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(id: string): Promise<Reading> {
    const reading = await this.readingRepository.findOne({
      where: { id },
      relations: { sensor: { tank: true } },
    });

    if (!reading) {
      throw new NotFoundException({ code: 'readingNotFound', id });
    }

    return reading;
  }

  async findBySensor(
    sensorId: string,
    filters?: ReadingFiltersDto,
  ): Promise<{
    readings: Reading[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryFilters = { ...filters, sensorId };
    return this.findAll(queryFilters);
  }

  async findByTank(
    tankId: string,
    filters?: ReadingFiltersDto,
  ): Promise<{
    readings: Reading[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryFilters = { ...filters, tankId };
    return this.findAll(queryFilters);
  }

  async getLatestBySensor(
    sensorId: string,
    limit: number = 10,
  ): Promise<Reading[]> {
    return this.readingRepository.find({
      where: { sensorId },
      relations: { sensor: { tank: true } },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async getLatestByTank(
    tankId: string,
    limit: number = 10,
  ): Promise<Reading[]> {
    const tanks = await this.dataSource.query(
      tankLevelSensorSql('t.id = $1', 'state'),
      [tankId],
    );
    if (!tanks[0]?.sensor_uuid) return [];
    return this.getLatestBySensor(tanks[0].sensor_uuid, limit);
  }

  /**
   * Série temporal agregada direto dos continuous aggregates do TimescaleDB
   * (leitura rápida de histórico longo). bucket: '5m' | '1h' | 'raw'.
   */
  async getTimeseries(filters: {
    sensorId?: string;
    tankId?: string;
    bucket?: string;
    from?: Date;
    to?: Date;
    limit?: number;
  }): Promise<any> {
    const bucket = filters.bucket ?? '1h';
    const limit = Math.min(filters.limit ?? 1000, 10000);
    const from = filters.from ?? null;
    const to = filters.to ?? null;
    const sensorId = filters.sensorId ?? null;
    const tankId = filters.tankId ?? null;

    if (bucket === 'raw') {
      const rows = await this.dataSource.query(
        `SELECT "timestamp", "sensorId", level, volume, quality, "oilWaterInterface"
         FROM readings
         WHERE ($1::timestamptz IS NULL OR "timestamp" >= $1)
           AND ($2::timestamptz IS NULL OR "timestamp" < $2)
           AND ($3::uuid IS NULL OR "sensorId" = $3)
           AND ($4::uuid IS NULL OR "sensorId" IN (SELECT id FROM sensors WHERE "tankId" = $4))
         ORDER BY "timestamp" DESC LIMIT $5`,
        [from, to, sensorId, tankId, limit],
      );
      return { bucket: 'raw', count: rows.length, series: rows.reverse() };
    }

    if (bucket !== '5m' && bucket !== '1h') {
      throw new BadRequestException({ code: 'invalidTimeseriesBucket' });
    }
    const view = bucket === '5m' ? 'readings_5m' : 'readings_1h';

    const rows = await this.dataSource.query(
      `SELECT bucket, "sensorId", avg_level, max_level, min_level,
              avg_volume, avg_oil_level, avg_water_level, avg_quality, sample_count
       FROM ${view}
       WHERE ($1::timestamptz IS NULL OR bucket >= $1)
         AND ($2::timestamptz IS NULL OR bucket < $2)
         AND ($3::uuid IS NULL OR "sensorId" = $3)
         AND ($4::uuid IS NULL OR "sensorId" IN (SELECT id FROM sensors WHERE "tankId" = $4))
       ORDER BY bucket DESC LIMIT $5`,
      [from, to, sensorId, tankId, limit],
    );

    // numeric do Postgres chega como string: converte para número na borda da API
    const series = rows.reverse().map((r: any) => ({
      ...r,
      avg_level: r.avg_level !== null ? Number(r.avg_level) : null,
      max_level: r.max_level !== null ? Number(r.max_level) : null,
      min_level: r.min_level !== null ? Number(r.min_level) : null,
      avg_volume: r.avg_volume !== null ? Number(r.avg_volume) : null,
      avg_oil_level: r.avg_oil_level !== null ? Number(r.avg_oil_level) : null,
      avg_water_level:
        r.avg_water_level !== null ? Number(r.avg_water_level) : null,
      avg_quality: r.avg_quality !== null ? Number(r.avg_quality) : null,
      sample_count: Number(r.sample_count),
    }));

    return {
      bucket,
      view,
      count: series.length,
      series,
    };
  }

  async getReadingStats(
    sensorId?: string,
    tankId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    let queryBuilder = this.readingRepository
      .createQueryBuilder('reading')
      .select([
        'COUNT(*) as totalReadings',
        'AVG(reading.level) as avgLevel',
        'MIN(reading.level) as minLevel',
        'MAX(reading.level) as maxLevel',
        'AVG(reading.volume) as avgVolume',
        'MIN(reading.volume) as minVolume',
        'MAX(reading.volume) as maxVolume',
        'AVG(reading.quality) as avgQuality',
        'MIN(reading.timestamp) as firstReading',
        'MAX(reading.timestamp) as lastReading',
      ]);

    if (sensorId) {
      queryBuilder = queryBuilder.where('reading.sensorId = :sensorId', {
        sensorId,
      });
    }

    if (tankId) {
      queryBuilder = queryBuilder
        .leftJoin('reading.sensor', 'sensor')
        .leftJoin('sensor.tank', 'tank')
        .andWhere('tank.id = :tankId', { tankId });
    }

    if (startDate && endDate) {
      queryBuilder = queryBuilder.andWhere(
        'reading.timestamp BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
    } else if (startDate) {
      queryBuilder = queryBuilder.andWhere('reading.timestamp >= :startDate', {
        startDate,
      });
    } else if (endDate) {
      queryBuilder = queryBuilder.andWhere('reading.timestamp <= :endDate', {
        endDate,
      });
    }

    const stats = await queryBuilder.getRawOne();

    // Calcular estatísticas adicionais
    const trend = await this.calculateTrend(
      sensorId,
      tankId,
      startDate,
      endDate,
    );
    const qualityDistribution = await this.getQualityDistribution(
      sensorId,
      tankId,
      startDate,
      endDate,
    );

    return {
      summary: {
        totalReadings: parseInt(this.raw(stats, 'totalReadings')) || 0,
        avgLevel: parseFloat(this.raw(stats, 'avgLevel')) || 0,
        minLevel: parseFloat(this.raw(stats, 'minLevel')) || null,
        maxLevel: parseFloat(this.raw(stats, 'maxLevel')) || null,
        avgVolume: parseFloat(this.raw(stats, 'avgVolume')) || 0,
        minVolume: parseFloat(this.raw(stats, 'minVolume')) || null,
        maxVolume: parseFloat(this.raw(stats, 'maxVolume')) || null,
        avgQuality: parseFloat(this.raw(stats, 'avgQuality')) || 0,
        firstReading: this.raw(stats, 'firstReading') || null,
        lastReading: this.raw(stats, 'lastReading') || null,
      },
      trend,
      qualityDistribution,
    };
  }

  // Postgres dobra aliases não-quotados para minúsculas (totalReadings → totalreadings),
  // então o resultado cru precisa ser lido de forma tolerante a caixa.
  private raw(row: any, key: string): any {
    return row?.[key] ?? row?.[key.toLowerCase()];
  }

  private async calculateTrend(
    sensorId?: string,
    tankId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    // Dividir o período em duas metades para calcular tendência
    let midDate: Date;

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      midDate = new Date(
        start.getTime() + (end.getTime() - start.getTime()) / 2,
      );
    } else {
      // Últimas 24 horas divididas ao meio
      const now = new Date();
      midDate = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    }

    // Primeira metade
    let queryBuilder1 = this.readingRepository
      .createQueryBuilder('reading')
      .select('AVG(reading.level) as avgLevel')
      .where('reading.timestamp < :midDate', { midDate });

    // Segunda metade
    let queryBuilder2 = this.readingRepository
      .createQueryBuilder('reading')
      .select('AVG(reading.level) as avgLevel')
      .where('reading.timestamp >= :midDate', { midDate });

    if (sensorId) {
      queryBuilder1 = queryBuilder1.andWhere('reading.sensorId = :sensorId', {
        sensorId,
      });
      queryBuilder2 = queryBuilder2.andWhere('reading.sensorId = :sensorId', {
        sensorId,
      });
    }

    if (tankId) {
      queryBuilder1 = queryBuilder1
        .leftJoin('reading.sensor', 'sensor')
        .leftJoin('sensor.tank', 'tank')
        .andWhere('tank.id = :tankId', { tankId });
      queryBuilder2 = queryBuilder2
        .leftJoin('reading.sensor', 'sensor')
        .leftJoin('sensor.tank', 'tank')
        .andWhere('tank.id = :tankId', { tankId });
    }

    const [firstHalf, secondHalf] = await Promise.all([
      queryBuilder1.getRawOne(),
      queryBuilder2.getRawOne(),
    ]);

    const firstAvg = parseFloat(this.raw(firstHalf, 'avgLevel')) || 0;
    const secondAvg = parseFloat(this.raw(secondHalf, 'avgLevel')) || 0;

    let trend: 'rising' | 'falling' | 'stable' = 'stable';
    let changePercent = 0;

    if (firstAvg > 0) {
      changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;

      if (changePercent > 5) {
        trend = 'rising';
      } else if (changePercent < -5) {
        trend = 'falling';
      }
    }

    return {
      trend,
      changePercent: Math.round(changePercent * 100) / 100,
      firstHalfAvg: Math.round(firstAvg * 100) / 100,
      secondHalfAvg: Math.round(secondAvg * 100) / 100,
    };
  }

  private async getQualityDistribution(
    sensorId?: string,
    tankId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any> {
    let queryBuilder = this.readingRepository
      .createQueryBuilder('reading')
      .select([
        'COUNT(*) as total',
        'AVG(reading.quality) as avgQuality',
        'MIN(reading.quality) as minQuality',
        'MAX(reading.quality) as maxQuality',
      ]);

    if (sensorId) {
      queryBuilder = queryBuilder.where('reading.sensorId = :sensorId', {
        sensorId,
      });
    }

    if (tankId) {
      queryBuilder = queryBuilder
        .leftJoin('reading.sensor', 'sensor')
        .leftJoin('sensor.tank', 'tank')
        .andWhere('tank.id = :tankId', { tankId });
    }

    if (startDate && endDate) {
      queryBuilder = queryBuilder.andWhere(
        'reading.timestamp BETWEEN :startDate AND :endDate',
        {
          startDate,
          endDate,
        },
      );
    }

    const qualityStats = await queryBuilder.getRawOne();

    // Distribuição por faixas de qualidade
    const distribution = {
      excellent: 0, // 90-100%
      good: 0, // 70-89%
      fair: 0, // 50-69%
      poor: 0, // 0-49%
    };

    const avgQualityRaw = this.raw(qualityStats, 'avgQuality');

    if (avgQualityRaw !== null && avgQualityRaw !== undefined) {
      const avgQuality = parseFloat(avgQualityRaw);

      if (avgQuality >= 90) distribution.excellent = 100;
      else if (avgQuality >= 70) distribution.good = 100;
      else if (avgQuality >= 50) distribution.fair = 100;
      else distribution.poor = 100;
    }

    return {
      average:
        Math.round(
          (parseFloat(this.raw(qualityStats, 'avgQuality')) || 0) * 100,
        ) / 100,
      minimum: parseInt(this.raw(qualityStats, 'minQuality')) || 0,
      maximum: parseInt(this.raw(qualityStats, 'maxQuality')) || 0,
      distribution,
    };
  }

  async getHourlyAggregates(
    sensorId?: string,
    tankId?: string,
    hours: number = 24,
  ): Promise<any[]> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

    let queryBuilder = this.readingRepository
      .createQueryBuilder('reading')
      .select([
        "DATE_TRUNC('hour', reading.timestamp) as hour",
        'AVG(reading.level) as avgLevel',
        'MIN(reading.level) as minLevel',
        'MAX(reading.level) as maxLevel',
        'AVG(reading.volume) as avgVolume',
        'COUNT(*) as readingCount',
      ])
      .where('reading.timestamp >= :startDate', { startDate })
      .groupBy("DATE_TRUNC('hour', reading.timestamp)")
      .orderBy('hour', 'ASC');

    if (sensorId) {
      queryBuilder = queryBuilder.andWhere('reading.sensorId = :sensorId', {
        sensorId,
      });
    }

    if (tankId) {
      queryBuilder = queryBuilder
        .leftJoin('reading.sensor', 'sensor')
        .leftJoin('sensor.tank', 'tank')
        .andWhere('tank.id = :tankId', { tankId });
    }

    const aggregates = await queryBuilder.getRawMany();

    return aggregates.map((agg) => ({
      hour: agg.hour,
      avgLevel: Math.round(parseFloat(agg.avgLevel) * 100) / 100,
      minLevel: Math.round(parseFloat(agg.minLevel) * 100) / 100,
      maxLevel: Math.round(parseFloat(agg.maxLevel) * 100) / 100,
      avgVolume: Math.round(parseFloat(agg.avgVolume) * 100) / 100,
      readingCount: parseInt(agg.readingCount),
    }));
  }

  async deleteOldReadings(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const result = await this.readingRepository.delete({
      timestamp: LessThanOrEqual(cutoffDate),
    });

    this.logger.log(
      `Deletadas ${result.affected} leituras antigas (antes de ${cutoffDate.toISOString()})`,
    );

    return result.affected || 0;
  }

  async recalculateVolumes(sensorId?: string): Promise<number> {
    // Buscar leituras sem volume calculado ou que precisam ser recalculadas
    let queryBuilder = this.readingRepository
      .createQueryBuilder('reading')
      .leftJoinAndSelect('reading.sensor', 'sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('reading.volume IS NULL OR reading.isProcessed = false');

    if (sensorId) {
      queryBuilder = queryBuilder.andWhere('reading.sensorId = :sensorId', {
        sensorId,
      });
    }

    const readings = await queryBuilder.getMany();
    let updatedCount = 0;

    for (const reading of readings) {
      if (reading.sensor?.tank) {
        const volume = reading.sensor.tank.getVolumeFromLevel(reading.level);

        await this.readingRepository.update(reading.id, {
          volume,
          isProcessed: true,
          processedAt: new Date(),
        });

        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      this.logger.log(`Recalculados volumes de ${updatedCount} leituras`);
    }

    return updatedCount;
  }

  private buildFilteredQuery(
    filters?: ReadingFiltersDto,
  ): SelectQueryBuilder<Reading> {
    const queryBuilder = this.readingRepository
      .createQueryBuilder('reading')
      .leftJoinAndSelect('reading.sensor', 'sensor')
      .leftJoinAndSelect('sensor.tank', 'tank');

    if (!filters) return queryBuilder;

    if (filters.sensorId) {
      queryBuilder.andWhere('reading.sensorId = :sensorId', {
        sensorId: filters.sensorId,
      });
    }

    if (filters.tankId) {
      queryBuilder.andWhere('tank.id = :tankId', { tankId: filters.tankId });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere(
        'reading.timestamp BETWEEN :startDate AND :endDate',
        {
          startDate: new Date(filters.startDate),
          endDate: new Date(filters.endDate),
        },
      );
    } else if (filters.startDate) {
      queryBuilder.andWhere('reading.timestamp >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    } else if (filters.endDate) {
      queryBuilder.andWhere('reading.timestamp <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    if (filters.minLevel !== undefined) {
      queryBuilder.andWhere('reading.level >= :minLevel', {
        minLevel: filters.minLevel,
      });
    }

    if (filters.maxLevel !== undefined) {
      queryBuilder.andWhere('reading.level <= :maxLevel', {
        maxLevel: filters.maxLevel,
      });
    }

    if (filters.minVolume !== undefined) {
      queryBuilder.andWhere('reading.volume >= :minVolume', {
        minVolume: filters.minVolume,
      });
    }

    if (filters.maxVolume !== undefined) {
      queryBuilder.andWhere('reading.volume <= :maxVolume', {
        maxVolume: filters.maxVolume,
      });
    }

    if (filters.minQuality !== undefined) {
      queryBuilder.andWhere('reading.quality >= :minQuality', {
        minQuality: filters.minQuality,
      });
    }

    if (filters.calibratedOnly) {
      queryBuilder.andWhere('reading.isCalibrated = true');
    }

    if (filters.processedOnly) {
      queryBuilder.andWhere('reading.isProcessed = true');
    }

    // Ordenação — o valor entra no SQL, então aceita apenas a whitelist do DTO
    const requested = filters.sortBy;
    const sortBy =
      requested &&
      (READING_SORT_COLUMNS as readonly string[]).includes(requested)
        ? requested
        : 'timestamp';
    const sortOrder = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';

    queryBuilder.orderBy(`reading.${sortBy}`, sortOrder);

    return queryBuilder;
  }
}
