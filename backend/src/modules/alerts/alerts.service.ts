import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  IsNull,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import {
  Alert,
  AlertStatus,
  AlertType,
  AlertSeverity,
} from '../../entities/alert.entity';
import { Tank } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { User } from '../../entities/user.entity';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertFiltersDto } from './dto/alert-filters.dto';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private dataSource: DataSource,
  ) {}

  async create(
    createAlertDto: CreateAlertDto,
    manager?: EntityManager,
  ): Promise<Alert> {
    const { tankId, sensorId } = createAlertDto;
    const alertRepository =
      manager?.getRepository(Alert) ?? this.alertRepository;
    const tankRepository = manager?.getRepository(Tank) ?? this.tankRepository;
    const sensorRepository =
      manager?.getRepository(Sensor) ?? this.sensorRepository;

    const tank = await tankRepository.findOne({ where: { id: tankId } });
    if (!tank) {
      throw new NotFoundException({ code: 'tankNotFound', id: tankId });
    }

    if (sensorId) {
      const sensor = await sensorRepository.findOne({
        where: { id: sensorId },
      });
      if (!sensor) {
        throw new NotFoundException({ code: 'sensorNotFound', id: sensorId });
      }
    }

    const alert = alertRepository.create({
      ...createAlertDto,
      status: AlertStatus.ACTIVE,
    });

    const savedAlert = await alertRepository.save(alert);

    this.logger.log(
      `Novo alerta criado: ${savedAlert.type} - ${savedAlert.title} (Tanque: ${tank.name})`,
    );

    return savedAlert;
  }

  async findAll(filters?: AlertFiltersDto): Promise<{
    alerts: Alert[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryBuilder = this.buildFilteredQuery(filters);

    const total = await queryBuilder.getCount();
    const limit = filters?.limit || 50;
    const page = filters?.page || 1;
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const alerts = await queryBuilder.skip(offset).take(limit).getMany();

    return {
      alerts,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findById(id: string): Promise<Alert> {
    const alert = await this.alertRepository.findOne({
      where: { id },
      relations: {
        tank: true,
        sensor: true,
        resolvedBy: true,
        acknowledgedBy: true,
      },
    });

    if (!alert) {
      throw new NotFoundException({ code: 'alertNotFound', id });
    }

    return alert;
  }

  async acknowledgeAlert(
    id: string,
    userId: string,
    notes?: string,
  ): Promise<Alert> {
    const alert = await this.findById(id);

    if (alert.status !== AlertStatus.ACTIVE) {
      throw new BadRequestException({ code: 'onlyActiveCanBeAcknowledged' });
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    // There is no acknowledgment-notes column: the note is kept in the
    // alert metadata (it used to be accepted and silently dropped).
    const note = notes?.trim().slice(0, 1000);
    await this.alertRepository.update(id, {
      status: AlertStatus.ACKNOWLEDGED,
      acknowledgedAt: new Date(),
      acknowledgedById: userId,
    });
    if (note) {
      const metadata: Record<string, unknown> = {
        ...(alert.metadata ?? {}),
        acknowledgmentNotes: note,
      };
      await this.alertRepository.save({ id, metadata } as Partial<Alert>);
    }

    const updatedAlert = await this.findById(id);

    this.logger.log(
      `Alerta reconhecido: ${updatedAlert.title} por ${user.name}`,
    );

    return updatedAlert;
  }

  async resolveAlert(
    id: string,
    userId: string,
    resolutionNotes?: string,
  ): Promise<Alert> {
    const alert = await this.findById(id);

    if (alert.status === AlertStatus.RESOLVED) {
      throw new BadRequestException({ code: 'alertAlreadyResolved' });
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    await this.alertRepository.update(id, {
      status: AlertStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedById: userId,
      resolutionNotes,
    });

    const updatedAlert = await this.findById(id);

    this.logger.log(`Alerta resolvido: ${updatedAlert.title} por ${user.name}`);

    return updatedAlert;
  }

  async getAlertsByTank(
    tankId: string,
    filters?: AlertFiltersDto,
  ): Promise<{
    alerts: Alert[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const queryFilters = { ...filters, tankId };
    return this.findAll(queryFilters);
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { status: AlertStatus.ACTIVE },
      relations: { tank: true, sensor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getAlertsBySeverity(severity: AlertSeverity): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { severity },
      relations: { tank: true, sensor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getAlertsByType(type: AlertType): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { type },
      relations: { tank: true, sensor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getAlertsByStatus(status: AlertStatus): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { status },
      relations: { tank: true, sensor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getUnacknowledgedAlerts(): Promise<Alert[]> {
    return this.alertRepository.find({
      where: { status: AlertStatus.ACTIVE },
      relations: { tank: true, sensor: true },
      order: { severity: 'DESC', createdAt: 'DESC' },
    });
  }

  async getCriticalAlerts(): Promise<Alert[]> {
    return this.alertRepository.find({
      where: {
        severity: AlertSeverity.CRITICAL,
        status: AlertStatus.ACTIVE,
      },
      relations: { tank: true, sensor: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getAlertStats(): Promise<any> {
    const [
      totalAlerts,
      activeAlerts,
      acknowledgedAlerts,
      resolvedAlerts,
      criticalAlerts,
    ] = await Promise.all([
      this.alertRepository.count(),
      this.alertRepository.count({ where: { status: AlertStatus.ACTIVE } }),
      this.alertRepository.count({
        where: { status: AlertStatus.ACKNOWLEDGED },
      }),
      this.alertRepository.count({ where: { status: AlertStatus.RESOLVED } }),
      this.alertRepository.count({
        where: { severity: AlertSeverity.CRITICAL, status: AlertStatus.ACTIVE },
      }),
    ]);

    // Estatísticas por tipo
    const alertsByType = await this.alertRepository
      .createQueryBuilder('alert')
      .select('alert.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.type')
      .getRawMany();

    // Estatísticas por severidade
    const alertsBySeverity = await this.alertRepository
      .createQueryBuilder('alert')
      .select('alert.severity', 'severity')
      .addSelect('COUNT(*)', 'count')
      .groupBy('alert.severity')
      .getRawMany();

    // Tempo médio de resolução
    const resolutionTimes = await this.alertRepository
      .createQueryBuilder('alert')
      .select(
        'EXTRACT(EPOCH FROM (alert.resolvedAt - alert.createdAt)) / 3600 as hours',
      )
      .where('alert.resolvedAt IS NOT NULL')
      .getRawMany();

    const avgResolutionTime =
      resolutionTimes.length > 0
        ? resolutionTimes.reduce(
            (sum, item) => sum + parseFloat(item.hours),
            0,
          ) / resolutionTimes.length
        : 0;

    return {
      overview: {
        total: totalAlerts,
        active: activeAlerts,
        acknowledged: acknowledgedAlerts,
        resolved: resolvedAlerts,
        critical: criticalAlerts,
      },
      distribution: {
        byType: alertsByType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count);
          return acc;
        }, {}),
        bySeverity: alertsBySeverity.reduce((acc, item) => {
          acc[item.severity] = parseInt(item.count);
          return acc;
        }, {}),
      },
      performance: {
        avgResolutionTimeHours: Math.round(avgResolutionTime * 100) / 100,
        resolutionRate:
          totalAlerts > 0 ? (resolvedAlerts / totalAlerts) * 100 : 0,
      },
    };
  }

  async createAutomaticAlert(
    type: AlertType,
    severity: AlertSeverity,
    tankId: string,
    sensorId?: string,
    currentLevel?: number,
    currentVolume?: number,
    thresholdValue?: number,
    metadata?: Record<string, any>,
    cooldownMs?: number,
  ): Promise<Alert> {
    const lockKey = JSON.stringify([type, severity, tankId, sensorId ?? null]);
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        lockKey,
      ]);
      const alertRepository = manager.getRepository(Alert);

      // A consulta e a criação ficam sob o mesmo lock entre réplicas.
      const open = await alertRepository.findOne({
        where: {
          type,
          severity,
          tankId,
          sensorId: sensorId ?? IsNull(),
          status: In([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        },
        order: { createdAt: 'DESC' },
      });
      if (open) return open;

      if (cooldownMs != null && cooldownMs > 0) {
        const latest = await alertRepository.findOne({
          where: {
            type,
            severity,
            tankId,
            sensorId: sensorId ?? IsNull(),
          },
          order: { createdAt: 'DESC' },
        });
        const age = latest?.createdAt
          ? Date.now() - new Date(latest.createdAt).getTime()
          : Infinity;
        if (latest && age < cooldownMs) return latest;
      }

      const alertInfo = this.generateAlertInfo(
        type,
        tankId,
        currentLevel,
        thresholdValue,
      );
      const alertDto: CreateAlertDto = {
        type,
        severity,
        title: alertInfo.title,
        message: alertInfo.message,
        tankId,
        sensorId,
        currentLevel,
        currentVolume,
        thresholdValue,
        metadata,
      };

      return this.create(alertDto, manager);
    });
  }

  async bulkAcknowledge(
    alertIds: string[],
    userId: string,
    notes?: string,
  ): Promise<Alert[]> {
    if (alertIds.length === 0) {
      throw new BadRequestException({ code: 'emptyIdList' });
    }

    if (alertIds.length > 100) {
      throw new BadRequestException({ code: 'bulkLimitExceeded' });
    }

    const results: Alert[] = [];
    for (const alertId of alertIds) {
      try {
        const result = await this.acknowledgeAlert(alertId, userId, notes);
        results.push(result);
      } catch (error) {
        this.logger.warn(
          `Erro ao reconhecer alerta ${alertId}:`,
          error.message,
        );
      }
    }

    return results;
  }

  async bulkResolve(
    alertIds: string[],
    userId: string,
    resolutionNotes?: string,
  ): Promise<Alert[]> {
    if (alertIds.length === 0) {
      throw new BadRequestException({ code: 'emptyIdList' });
    }

    if (alertIds.length > 100) {
      throw new BadRequestException({ code: 'bulkLimitExceeded' });
    }

    const results: Alert[] = [];
    for (const alertId of alertIds) {
      try {
        const result = await this.resolveAlert(
          alertId,
          userId,
          resolutionNotes,
        );
        results.push(result);
      } catch (error) {
        this.logger.warn(`Erro ao resolver alerta ${alertId}:`, error.message);
      }
    }

    return results;
  }

  async getAlertsRequiringAction(): Promise<Alert[]> {
    // Buscar alertas que precisam de ação (críticos não reconhecidos ou com prazo vencido)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    return this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.tank', 'tank')
      .leftJoinAndSelect('alert.sensor', 'sensor')
      .where('alert.status = :active', { active: AlertStatus.ACTIVE })
      .andWhere(
        '(alert.severity = :critical) OR (alert.createdAt < :oneHourAgo)',
        { critical: AlertSeverity.CRITICAL, oneHourAgo },
      )
      .orderBy('alert.severity', 'DESC')
      .addOrderBy('alert.createdAt', 'ASC')
      .getMany();
  }

  /**
   * Título/mensagem persistidos com o alerta — em inglês (língua base do
   * sistema, para auditoria/logs consistentes). A API traduz na borda por
   * type + parâmetros (I18nService.localizeAlert), então este texto é
   * apenas fallback e não o que o cliente vê.
   */
  private generateAlertInfo(
    type: AlertType,
    tankId: string,
    currentLevel?: number,
    thresholdValue?: number,
  ): { title: string; message: string } {
    const levelInfo = currentLevel != null ? `${currentLevel}m` : 'unknown';
    const thresholdInfo =
      thresholdValue != null ? `${thresholdValue}m` : 'unknown';

    switch (type) {
      case AlertType.HIGH_LEVEL:
        return {
          title: 'High Level Detected',
          message: `Tank level reached ${levelInfo}, at or above its alarm limit of ${thresholdInfo}`,
        };

      case AlertType.LOW_LEVEL:
        return {
          title: 'Low Level Detected',
          message: `Tank level reached ${levelInfo}, at or below its alarm limit of ${thresholdInfo}`,
        };

      case AlertType.OVERFLOW_RISK:
        return {
          title: 'Overflow Risk',
          message: `Critical overflow risk! Current level: ${levelInfo}, limit: ${thresholdInfo}`,
        };

      case AlertType.SENSOR_OFFLINE:
        return {
          title: 'Sensor Offline',
          message:
            'Sensor stopped sending data. Check connectivity and power supply.',
        };

      case AlertType.BATTERY_LOW:
        return {
          title: 'Low Battery',
          message: 'Critical battery level. Replace the battery immediately.',
        };

      case AlertType.SENSOR_ERROR:
        return {
          title: 'Sensor Error',
          message:
            'Sensor is reporting errors. Check configuration and calibration.',
        };

      case AlertType.MAINTENANCE_DUE:
        return {
          title: 'Maintenance Overdue',
          message: 'Preventive maintenance for the tank/sensor is overdue.',
        };

      default:
        return {
          title: 'System Alert',
          message: `Alert of type ${type} detected on tank ${tankId}`,
        };
    }
  }

  private buildFilteredQuery(
    filters?: AlertFiltersDto,
  ): SelectQueryBuilder<Alert> {
    const queryBuilder = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.tank', 'tank')
      .leftJoinAndSelect('alert.sensor', 'sensor')
      .leftJoinAndSelect('alert.resolvedBy', 'resolvedBy')
      .leftJoinAndSelect('alert.acknowledgedBy', 'acknowledgedBy');

    if (!filters) return queryBuilder;

    if (filters.type) {
      queryBuilder.andWhere('alert.type = :type', { type: filters.type });
    }

    if (filters.severity) {
      queryBuilder.andWhere('alert.severity = :severity', {
        severity: filters.severity,
      });
    }

    if (filters.status) {
      queryBuilder.andWhere('alert.status = :status', {
        status: filters.status,
      });
    }

    if (filters.tankId) {
      queryBuilder.andWhere('alert.tankId = :tankId', {
        tankId: filters.tankId,
      });
    }

    if (filters.sensorId) {
      queryBuilder.andWhere('alert.sensorId = :sensorId', {
        sensorId: filters.sensorId,
      });
    }

    if (filters.startDate && filters.endDate) {
      queryBuilder.andWhere('alert.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(filters.startDate),
        endDate: new Date(filters.endDate),
      });
    } else if (filters.startDate) {
      queryBuilder.andWhere('alert.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    } else if (filters.endDate) {
      queryBuilder.andWhere('alert.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(alert.title ILIKE :search OR alert.message ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    if (filters.unacknowledgedOnly) {
      queryBuilder.andWhere('alert.status = :active', {
        active: AlertStatus.ACTIVE,
      });
    }

    if (filters.criticalOnly) {
      queryBuilder.andWhere('alert.severity = :critical', {
        critical: AlertSeverity.CRITICAL,
      });
    }

    // Ordenação
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'DESC';

    // Mapeamento de campos de ordenação
    const sortFieldMap = {
      createdAt: 'alert.createdAt',
      severity: 'alert.severity',
      type: 'alert.type',
      acknowledgedAt: 'alert.acknowledgedAt',
    };

    queryBuilder.orderBy(sortFieldMap[sortBy] || 'alert.createdAt', sortOrder);

    return queryBuilder;
  }
}
