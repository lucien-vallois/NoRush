import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tank, TankStatus } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Alert, AlertStatus } from '../../entities/alert.entity';
import { CreateTankDto } from './dto/create-tank.dto';
import { UpdateTankDto } from './dto/update-tank.dto';
import { nominalVolumeLiters, validateTankConfig } from './tank-config';

@Injectable()
export class TanksService {
  private readonly logger = new Logger(TanksService.name);

  constructor(
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
  ) {}

  async create(createTankDto: CreateTankDto): Promise<Tank> {
    const { code, latitude, longitude } = createTankDto;

    // Verifica se o código já existe
    const existingTank = await this.tankRepository.findOne({ where: { code } });
    if (existingTank) {
      throw new ConflictException({ code: 'tankCodeExists', tankCode: code });
    }

    const configError = validateTankConfig(createTankDto);
    if (configError) throw new BadRequestException({ code: configError });

    const { height, diameter, volume } = createTankDto.dimensions;
    const tank = this.tankRepository.create({
      ...createTankDto,
      dimensions: {
        height,
        diameter,
        volume:
          volume ??
          nominalVolumeLiters(
            { height, diameter },
            createTankDto.arqueacaoTable,
          ),
      },
      latitude: parseFloat(latitude.toString()),
      longitude: parseFloat(longitude.toString()),
    });

    const savedTank = await this.tankRepository.save(tank);
    this.logger.log(`Novo tanque criado: ${code} - ${savedTank.name}`);

    return savedTank;
  }

  async findAll(): Promise<Tank[]> {
    return this.tankRepository.find({
      relations: ['sensors'],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<Tank> {
    const tank = await this.tankRepository.findOne({
      where: { id },
      relations: ['sensors', 'alerts'],
    });

    if (!tank) {
      throw new NotFoundException({ code: 'tankNotFound', id });
    }

    return tank;
  }

  async findByCode(code: string): Promise<Tank> {
    const tank = await this.tankRepository.findOne({
      where: { code },
      relations: ['sensors', 'alerts'],
    });

    if (!tank) {
      throw new NotFoundException({ code: 'tankCodeNotFound', tankCode: code });
    }

    return tank;
  }

  async update(id: string, updateTankDto: UpdateTankDto): Promise<Tank> {
    const tank = await this.findById(id);

    // Verifica se o código está sendo alterado e se já existe
    if (updateTankDto.code && updateTankDto.code !== tank.code) {
      const existingTank = await this.tankRepository.findOne({
        where: { code: updateTankDto.code },
      });
      if (existingTank) {
        throw new ConflictException({
          code: 'tankCodeExists',
          tankCode: updateTankDto.code,
        });
      }
    }

    // Valida o resultado da edição (valores novos sobre os atuais)
    const num = (v: unknown) => (v == null ? null : Number(v));
    const merged = {
      dimensions: updateTankDto.dimensions ?? tank.dimensions,
      arqueacaoTable:
        updateTankDto.arqueacaoTable !== undefined
          ? updateTankDto.arqueacaoTable
          : tank.arqueacaoTable,
      minLevelThreshold: num(
        updateTankDto.minLevelThreshold ?? tank.minLevelThreshold,
      ),
      lowLevelThreshold: num(
        updateTankDto.lowLevelThreshold ?? tank.lowLevelThreshold,
      ),
      maxLevelThreshold: num(
        updateTankDto.maxLevelThreshold ?? tank.maxLevelThreshold,
      ),
      overflowThreshold: num(
        updateTankDto.overflowThreshold ?? tank.overflowThreshold,
      ),
    };
    const configError = validateTankConfig({
      ...merged,
      dimensions: merged.dimensions && {
        height: Number(merged.dimensions.height),
        diameter: Number(merged.dimensions.diameter),
      },
    });
    if (configError) throw new BadRequestException({ code: configError });

    const { latitude, longitude, dimensions, ...rest } = updateTankDto;
    await this.tankRepository.update(id, {
      ...rest,
      ...(dimensions
        ? {
            dimensions: {
              height: dimensions.height,
              diameter: dimensions.diameter,
              volume:
                dimensions.volume ??
                nominalVolumeLiters(dimensions, merged.arqueacaoTable),
            },
          }
        : {}),
      latitude: latitude != null ? parseFloat(latitude.toString()) : undefined,
      longitude:
        longitude != null ? parseFloat(longitude.toString()) : undefined,
    });

    const updatedTank = await this.findById(id);
    this.logger.log(
      `Tanque atualizado: ${updatedTank.code} - ${updatedTank.name}`,
    );

    return updatedTank;
  }

  async delete(id: string): Promise<void> {
    const tank = await this.findById(id);

    // Verifica se há sensores associados
    const sensorCount = await this.sensorRepository.count({
      where: { tankId: id },
    });

    if (sensorCount > 0) {
      throw new ConflictException({
        code: 'tankHasSensors',
        count: sensorCount,
      });
    }

    await this.tankRepository.delete(id);
    this.logger.log(`Tanque deletado: ${tank.code} - ${tank.name}`);
  }

  async getTanksByStatus(status: TankStatus): Promise<Tank[]> {
    return this.tankRepository.find({
      where: { status },
      relations: ['sensors'],
      order: { name: 'ASC' },
    });
  }

  async getTanksNeedingMaintenance(): Promise<Tank[]> {
    const now = new Date();

    return this.tankRepository
      .createQueryBuilder('tank')
      .where('tank.nextMaintenanceDate <= :now', { now })
      .orWhere('tank.lastMaintenanceDate IS NULL')
      .leftJoinAndSelect('tank.sensors', 'sensors')
      .orderBy('tank.nextMaintenanceDate', 'ASC')
      .getMany();
  }

  async getTankStats(id: string): Promise<any> {
    const tank = await this.findById(id);

    // Conta sensores por status
    const sensorStats = await this.sensorRepository
      .createQueryBuilder('sensor')
      .select('sensor.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('sensor.tankId = :tankId', { tankId: id })
      .groupBy('sensor.status')
      .getRawMany();

    // Conta alertas ativos
    const activeAlertsCount = await this.alertRepository.count({
      where: { tankId: id, status: AlertStatus.ACTIVE },
    });

    // Última leitura (simplificada - em produção você pode otimizar isso)
    const lastReading = await this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoin('sensor.readings', 'reading')
      .where('sensor.tankId = :tankId', { tankId: id })
      .orderBy('reading.timestamp', 'DESC')
      .select([
        'reading.level',
        'reading.volume',
        'reading.timestamp',
        'sensor.name as sensorName',
      ])
      .getRawOne();

    return {
      tank: {
        id: tank.id,
        code: tank.code,
        name: tank.name,
        status: tank.status,
      },
      sensors: {
        total: sensorStats.reduce((sum, stat) => sum + parseInt(stat.count), 0),
        byStatus: sensorStats.reduce((acc, stat) => {
          acc[stat.status] = parseInt(stat.count);
          return acc;
        }, {}),
      },
      alerts: {
        active: activeAlertsCount,
      },
      lastReading: lastReading || null,
    };
  }

  async getNearbyTanks(
    latitude: number,
    longitude: number,
    radiusKm: number = 10,
  ): Promise<Tank[]> {
    // Esta é uma implementação simplificada
    // Em produção, você pode usar PostGIS ou uma função de distância mais precisa
    const latDiff = radiusKm / 111; // Aproximadamente 111km por grau de latitude
    const lngDiff = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

    return this.tankRepository
      .createQueryBuilder('tank')
      .where('tank.latitude BETWEEN :latMin AND :latMax', {
        latMin: latitude - latDiff,
        latMax: latitude + latDiff,
      })
      .andWhere('tank.longitude BETWEEN :lngMin AND :lngMax', {
        lngMin: longitude - lngDiff,
        lngMax: longitude + lngDiff,
      })
      .leftJoinAndSelect('tank.sensors', 'sensors')
      .getMany();
  }

  async updateMaintenanceDate(
    id: string,
    maintenanceDate: Date,
  ): Promise<Tank> {
    const tank = await this.findById(id);

    await this.tankRepository.update(id, {
      lastMaintenanceDate: maintenanceDate,
      // Define próxima manutenção para 6 meses depois
      nextMaintenanceDate: new Date(
        maintenanceDate.getTime() + 180 * 24 * 60 * 60 * 1000,
      ),
    });

    const updatedTank = await this.findById(id);
    this.logger.log(
      `Data de manutenção atualizada para tanque: ${updatedTank.code}`,
    );

    return updatedTank;
  }

  async validateTankConfiguration(
    id: string,
  ): Promise<{ valid: boolean; issues: string[] }> {
    const tank = await this.findById(id);
    const issues: string[] = [];

    // Verifica dimensões
    if (
      !tank.dimensions ||
      tank.dimensions.height <= 0 ||
      tank.dimensions.diameter <= 0
    ) {
      issues.push('Dimensões do tanque inválidas');
    }

    // Verifica localização
    if (Math.abs(tank.latitude) > 90 || Math.abs(tank.longitude) > 180) {
      issues.push('Coordenadas de localização inválidas');
    }

    // Verifica limites de alerta
    if (
      tank.maxLevelThreshold &&
      tank.maxLevelThreshold > tank.dimensions.height
    ) {
      issues.push('Limite máximo de nível maior que a altura do tanque');
    }

    if (tank.minLevelThreshold && tank.minLevelThreshold < 0) {
      issues.push('Limite mínimo de nível não pode ser negativo');
    }

    // Verifica tabela de arqueação
    if (tank.arqueacaoTable && tank.arqueacaoTable.length > 0) {
      const sortedTable = tank.arqueacaoTable.sort((a, b) => a.level - b.level);

      for (let i = 1; i < sortedTable.length; i++) {
        if (sortedTable[i].volume < sortedTable[i - 1].volume) {
          issues.push('Tabela de arqueação não está ordenada corretamente');
          break;
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
