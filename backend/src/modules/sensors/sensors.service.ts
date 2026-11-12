import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Sensor, SensorStatus, SensorType } from '../../entities/sensor.entity';
import { Tank } from '../../entities/tank.entity';
import { Reading } from '../../entities/reading.entity';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { UpdateSensorDto } from './dto/update-sensor.dto';
import { SensorFiltersDto } from './dto/sensor-filters.dto';

@Injectable()
export class SensorsService {
  private readonly logger = new Logger(SensorsService.name);

  constructor(
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @InjectRepository(Reading)
    private readingRepository: Repository<Reading>,
  ) {}

  async create(createSensorDto: CreateSensorDto): Promise<Sensor> {
    const { sensorId, tankId } = createSensorDto;

    // Verificar se o sensor já existe
    const existingSensor = await this.sensorRepository.findOne({
      where: { sensorId },
    });
    if (existingSensor) {
      throw new ConflictException({ code: 'sensorIdAlreadyExists' });
    }

    // Verificar se o tanque existe
    const tank = await this.tankRepository.findOne({ where: { id: tankId } });
    if (!tank) {
      throw new NotFoundException({ code: 'tankNotFound', id: tankId });
    }

    const sensor = this.sensorRepository.create({
      ...createSensorDto,
      status: SensorStatus.ACTIVE,
    });

    const savedSensor = await this.sensorRepository.save(sensor);
    this.logger.log(
      `Novo sensor criado: ${sensorId} - ${savedSensor.name} (Tanque: ${tank.name})`,
    );

    return savedSensor;
  }

  async findAll(filters?: SensorFiltersDto): Promise<Sensor[]> {
    const queryBuilder = this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .orderBy('sensor.createdAt', 'DESC');

    this.applyFilters(queryBuilder, filters);

    return queryBuilder.getMany();
  }

  async findById(id: string): Promise<Sensor> {
    const sensor = await this.sensorRepository.findOne({
      where: { id },
      relations: ['tank'],
    });

    if (!sensor) {
      throw new NotFoundException({ code: 'sensorNotFound', id });
    }

    return sensor;
  }

  async findBySensorId(sensorId: string): Promise<Sensor> {
    const sensor = await this.sensorRepository.findOne({
      where: { sensorId },
      relations: ['tank'],
    });

    if (!sensor) {
      throw new NotFoundException({ code: 'sensorNotFound', id: sensorId });
    }

    return sensor;
  }

  async update(id: string, updateSensorDto: UpdateSensorDto): Promise<Sensor> {
    const sensor = await this.findById(id);

    // Verificar se o sensorId está sendo alterado e se já existe
    if (
      updateSensorDto.sensorId &&
      updateSensorDto.sensorId !== sensor.sensorId
    ) {
      const existingSensor = await this.sensorRepository.findOne({
        where: { sensorId: updateSensorDto.sensorId },
      });
      if (existingSensor) {
        throw new ConflictException({ code: 'sensorIdAlreadyExists' });
      }
    }

    // Verificar se o tanque está sendo alterado e se existe
    if (updateSensorDto.tankId && updateSensorDto.tankId !== sensor.tankId) {
      const tank = await this.tankRepository.findOne({
        where: { id: updateSensorDto.tankId },
      });
      if (!tank) {
        throw new NotFoundException({
          code: 'tankNotFound',
          id: updateSensorDto.tankId,
        });
      }
    }

    await this.sensorRepository.update(id, updateSensorDto);

    const updatedSensor = await this.findById(id);
    this.logger.log(
      `Sensor atualizado: ${updatedSensor.sensorId} - ${updatedSensor.name}`,
    );

    return updatedSensor;
  }

  async delete(id: string): Promise<void> {
    const sensor = await this.findById(id);

    // Verificar se há leituras associadas
    const readingCount = await this.readingRepository.count({
      where: { sensorId: id },
    });

    if (readingCount > 0) {
      throw new ConflictException(
        `Não é possível excluir o sensor. Existem ${readingCount} leituras associadas.`,
      );
    }

    await this.sensorRepository.delete(id);
    this.logger.log(`Sensor deletado: ${sensor.sensorId} - ${sensor.name}`);
  }

  async getSensorsByTank(tankId: string): Promise<Sensor[]> {
    return this.sensorRepository.find({
      where: { tankId },
      relations: ['tank'],
      order: { name: 'ASC' },
    });
  }

  async getSensorsByStatus(status: SensorStatus): Promise<Sensor[]> {
    return this.sensorRepository.find({
      where: { status },
      relations: ['tank'],
      order: { name: 'ASC' },
    });
  }

  async getSensorsByType(type: SensorType): Promise<Sensor[]> {
    return this.sensorRepository.find({
      where: { type },
      relations: ['tank'],
      order: { name: 'ASC' },
    });
  }

  async getOnlineSensors(): Promise<Sensor[]> {
    const sensors = await this.sensorRepository.find({
      where: { status: SensorStatus.ACTIVE },
      relations: ['tank'],
    });

    // Filtrar apenas sensores que transmitiram nos últimos 5 minutos
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    return sensors.filter(
      (sensor) =>
        sensor.lastTransmissionAt && sensor.lastTransmissionAt > fiveMinutesAgo,
    );
  }

  async getSensorsNeedingCalibration(): Promise<Sensor[]> {
    const now = new Date();

    return this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('sensor.nextCalibrationDate <= :now', { now })
      .orWhere('sensor.calibrationDate IS NULL')
      .orderBy('sensor.nextCalibrationDate', 'ASC')
      .getMany();
  }

  async getSensorsWithLowBattery(): Promise<Sensor[]> {
    return this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('sensor.batteryLevel <= :lowBatteryThreshold', {
        lowBatteryThreshold: 20,
      })
      .andWhere('sensor.batteryLevel IS NOT NULL')
      .orderBy('sensor.batteryLevel', 'ASC')
      .getMany();
  }

  async updateCalibrationDate(
    id: string,
    calibrationDate: Date,
  ): Promise<Sensor> {
    await this.findById(id); // 404 for an unknown gauge

    // Calcular próxima calibração (geralmente a cada 6 meses ou 1 ano)
    const nextCalibrationDate = new Date(calibrationDate);
    nextCalibrationDate.setMonth(nextCalibrationDate.getMonth() + 6);

    await this.sensorRepository.update(id, {
      calibrationDate,
      nextCalibrationDate,
      updatedAt: new Date(),
    });

    const updatedSensor = await this.findById(id);
    this.logger.log(
      `Data de calibração atualizada para sensor: ${updatedSensor.sensorId}`,
    );

    return updatedSensor;
  }

  async updateFirmwareVersion(
    id: string,
    firmwareVersion: string,
  ): Promise<Sensor> {
    await this.findById(id); // 404 for an unknown gauge

    await this.sensorRepository.update(id, {
      firmwareVersion,
      updatedAt: new Date(),
    });

    const updatedSensor = await this.findById(id);
    this.logger.log(
      `Firmware atualizado para sensor: ${updatedSensor.sensorId} - ${firmwareVersion}`,
    );

    return updatedSensor;
  }

  async getSensorStats(id: string): Promise<any> {
    const sensor = await this.findById(id);

    // Estatísticas de leituras
    const readingStats = await this.readingRepository
      .createQueryBuilder('reading')
      .select([
        'COUNT(*) as totalReadings',
        'AVG(reading.level) as avgLevel',
        'MIN(reading.level) as minLevel',
        'MAX(reading.level) as maxLevel',
        'MIN(reading.timestamp) as firstReading',
        'MAX(reading.timestamp) as lastReading',
      ])
      .where('reading.sensorId = :sensorId', { sensorId: id })
      .getRawOne();

    // Leituras das últimas 24 horas
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReadings = await this.readingRepository.count({
      where: {
        sensorId: id,
        timestamp: yesterday,
      },
    });

    // Status da bateria
    const batteryStatus = sensor.getBatteryStatus();

    return {
      sensor: {
        id: sensor.id,
        sensorId: sensor.sensorId,
        name: sensor.name,
        type: sensor.type,
        status: sensor.status,
        isOnline: sensor.isOnline(),
      },
      readings: readingStats || {
        totalReadings: 0,
        avgLevel: null,
        minLevel: null,
        maxLevel: null,
        firstReading: null,
        lastReading: null,
      },
      recentActivity: {
        readingsLast24h: recentReadings,
        lastTransmission: sensor.lastTransmissionAt,
        transmissionCount: sensor.transmissionCount,
      },
      battery: {
        level: sensor.batteryLevel,
        status: batteryStatus,
        lastUpdate: sensor.batteryLastUpdate,
      },
      maintenance: {
        needsCalibration: sensor.needsCalibration(),
        nextCalibrationDate: sensor.nextCalibrationDate,
        lastCalibrationDate: sensor.calibrationDate,
      },
    };
  }

  async bulkUpdateStatus(
    sensorIds: string[],
    status: SensorStatus,
  ): Promise<Sensor[]> {
    if (sensorIds.length === 0) {
      throw new BadRequestException({ code: 'emptySensorIdList' });
    }

    if (sensorIds.length > 100) {
      throw new BadRequestException({
        code: 'sensorBulkLimitExceeded',
        max: 100,
      });
    }

    // Verificar se todos os sensores existem
    const sensors = await this.sensorRepository
      .createQueryBuilder('sensor')
      .where('sensor.id IN (:...ids)', { ids: sensorIds })
      .getMany();

    if (sensors.length !== sensorIds.length) {
      const foundIds = sensors.map((s) => s.id);
      const missingIds = sensorIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException({
        code: 'sensorsNotFound',
        ids: missingIds.join(', '),
      });
    }

    // Atualizar status em lote
    await this.sensorRepository
      .createQueryBuilder()
      .update(Sensor)
      .set({ status, updatedAt: new Date() })
      .where('id IN (:...ids)', { ids: sensorIds })
      .execute();

    const updatedSensors = await this.sensorRepository.find({
      where: sensorIds.map((id) => ({ id })),
      relations: ['tank'],
    });

    this.logger.log(
      `${sensorIds.length} sensores atualizados para status: ${status}`,
    );

    return updatedSensors;
  }

  async getSensorsDashboard(): Promise<any> {
    const [
      totalSensors,
      activeSensors,
      onlineSensors,
      maintenanceSensors,
      lowBatterySensors,
    ] = await Promise.all([
      this.sensorRepository.count(),
      this.sensorRepository.count({ where: { status: SensorStatus.ACTIVE } }),
      this.getOnlineSensors().then((sensors) => sensors.length),
      // manutenção = status do sensor (não "precisando de calibração")
      this.sensorRepository.count({
        where: { status: SensorStatus.MAINTENANCE },
      }),
      this.getSensorsWithLowBattery().then((sensors) => sensors.length),
    ]);

    // offline = ativos que não transmitem há mais de 5min (o status continua
    // 'active'; ninguém fica com status=offline por parar de transmitir)
    const offlineSensors = Math.max(0, activeSensors - onlineSensors);

    // Distribuição por tipo
    const sensorsByType = await this.sensorRepository
      .createQueryBuilder('sensor')
      .select('sensor.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sensor.type')
      .getRawMany();

    // Distribuição por protocolo
    const sensorsByProtocol = await this.sensorRepository
      .createQueryBuilder('sensor')
      .select('sensor.protocol', 'protocol')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sensor.protocol')
      .getRawMany();

    return {
      overview: {
        total: totalSensors,
        active: activeSensors,
        online: onlineSensors,
        offline: offlineSensors,
        maintenance: maintenanceSensors,
        lowBattery: lowBatterySensors,
      },
      distribution: {
        byType: sensorsByType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count);
          return acc;
        }, {}),
        byProtocol: sensorsByProtocol.reduce((acc, item) => {
          acc[item.protocol] = parseInt(item.count);
          return acc;
        }, {}),
      },
      healthScore: this.calculateHealthScore({
        totalSensors,
        onlineSensors,
        maintenanceSensors,
        lowBatterySensors,
      }),
    };
  }

  private calculateHealthScore(stats: any): number {
    if (stats.totalSensors === 0) return 100;

    const onlineRatio = stats.onlineSensors / stats.totalSensors;
    const maintenanceRatio = stats.maintenanceSensors / stats.totalSensors;
    const lowBatteryRatio = stats.lowBatterySensors / stats.totalSensors;

    // Peso: 50% online, 30% manutenção, 20% bateria
    const score =
      onlineRatio * 50 +
      (1 - maintenanceRatio) * 30 +
      (1 - lowBatteryRatio) * 20;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<Sensor>,
    filters?: SensorFiltersDto,
  ): void {
    if (!filters) return;

    if (filters.type) {
      queryBuilder.andWhere('sensor.type = :type', { type: filters.type });
    }

    if (filters.protocol) {
      queryBuilder.andWhere('sensor.protocol = :protocol', {
        protocol: filters.protocol,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('sensor.status = :status', {
        status: filters.status,
      });
    }

    if (filters.tankId) {
      queryBuilder.andWhere('sensor.tankId = :tankId', {
        tankId: filters.tankId,
      });
    }

    if (filters.model) {
      queryBuilder.andWhere('sensor.model = :model', { model: filters.model });
    }

    if (filters.manufacturer) {
      queryBuilder.andWhere('sensor.manufacturer = :manufacturer', {
        manufacturer: filters.manufacturer,
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(sensor.name ILIKE :search OR sensor.sensorId ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.onlineOnly) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      queryBuilder.andWhere('sensor.lastTransmissionAt > :fiveMinutesAgo', {
        fiveMinutesAgo,
      });
    }

    if (filters.needsCalibration) {
      const now = new Date();
      queryBuilder.andWhere(
        '(sensor.nextCalibrationDate <= :now OR sensor.calibrationDate IS NULL)',
        { now },
      );
    }

    if (filters.lowBattery) {
      queryBuilder.andWhere('sensor.batteryLevel <= :lowBatteryThreshold', {
        lowBatteryThreshold: 20,
      });
    }
  }
}
