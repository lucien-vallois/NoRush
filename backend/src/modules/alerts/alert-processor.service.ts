import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertType, AlertSeverity } from '../../entities/alert.entity';
import { Tank } from '../../entities/tank.entity';
import { Sensor, SensorStatus } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { AlertsService } from './alerts.service';

interface AlertRule {
  type: AlertType;
  severity: AlertSeverity;
  condition: (tank: Tank, sensor?: Sensor, reading?: Reading) => boolean;
  cooldown: number; // minutos entre alertas do mesmo tipo
}

@Injectable()
export class AlertProcessorService {
  private readonly logger = new Logger(AlertProcessorService.name);
  private lastAlertTimes = new Map<string, Date>();

  // Regras de alerta configuráveis
  private alertRules: AlertRule[] = [
    {
      type: AlertType.HIGH_LEVEL,
      severity: AlertSeverity.MEDIUM,
      condition: (tank, sensor, reading) =>
        !!(reading && tank.maxLevelThreshold && reading.level >= tank.maxLevelThreshold),
      cooldown: 30, // 30 minutos
    },
    {
      type: AlertType.LOW_LEVEL,
      severity: AlertSeverity.MEDIUM,
      condition: (tank, sensor, reading) =>
        !!(reading && tank.minLevelThreshold && reading.level <= tank.minLevelThreshold),
      cooldown: 30,
    },
    {
      type: AlertType.OVERFLOW_RISK,
      severity: AlertSeverity.CRITICAL,
      condition: (tank, sensor, reading) =>
        !!(reading && tank.overflowThreshold && reading.level >= tank.overflowThreshold),
      cooldown: 15, // 15 minutos (mais frequente para críticos)
    },
    {
      type: AlertType.LOW_LEVEL,
      severity: AlertSeverity.HIGH,
      condition: (tank, sensor, reading) =>
        !!(reading && tank.lowLevelThreshold && reading.level <= tank.lowLevelThreshold),
      cooldown: 15,
    },
  ];

  constructor(
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Reading)
    private readingRepository: Repository<Reading>,
    private alertsService: AlertsService,
  ) {}

  async processReadingForAlerts(reading: Reading): Promise<void> {
    try {
      // Buscar sensor e tanque relacionados
      const sensor = await this.sensorRepository.findOne({
        where: { id: reading.sensorId },
        relations: ['tank'],
      });

      if (!sensor || !sensor.tank) {
        return; // Não há tanque associado
      }

      const tank = sensor.tank;

      // Verificar todas as regras de alerta
      for (const rule of this.alertRules) {
        if (rule.condition(tank, sensor, reading)) {
          await this.createAlertIfNotCooldown(rule, tank, sensor, reading);
        }
      }

    } catch (error) {
      this.logger.error(`Erro ao processar alertas para leitura ${reading.id}:`, error);
    }
  }

  async checkSensorOfflineAlerts(): Promise<void> {
    try {
      // Buscar sensores ativos
      const sensors = await this.sensorRepository.find({
        where: { status: SensorStatus.ACTIVE },
        relations: ['tank'],
      });

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      for (const sensor of sensors) {
        // Verificar se o sensor está offline
        if (!sensor.lastTransmissionAt || sensor.lastTransmissionAt < fiveMinutesAgo) {
          await this.createOfflineAlert(sensor);
        }
      }

    } catch (error) {
      this.logger.error('Erro ao verificar sensores offline:', error);
    }
  }

  async checkLowBatteryAlerts(): Promise<void> {
    try {
      const sensors = await this.sensorRepository
        .createQueryBuilder('sensor')
        .leftJoinAndSelect('sensor.tank', 'tank')
        .where('sensor.batteryLevel <= :lowBatteryThreshold', { lowBatteryThreshold: 20 })
        .andWhere('sensor.batteryLevel IS NOT NULL')
        .getMany();

      for (const sensor of sensors) {
        await this.createLowBatteryAlert(sensor);
      }

    } catch (error) {
      this.logger.error('Erro ao verificar bateria baixa:', error);
    }
  }

  async checkMaintenanceAlerts(): Promise<void> {
    try {
      const now = new Date();

      // Tanques que precisam de manutenção
      const tanksNeedingMaintenance = await this.tankRepository
        .createQueryBuilder('tank')
        .where('tank.nextMaintenanceDate <= :now', { now })
        .orWhere('tank.lastMaintenanceDate IS NULL')
        .getMany();

      for (const tank of tanksNeedingMaintenance) {
        await this.createMaintenanceAlert(tank);
      }

      // Sensores que precisam de calibração
      const sensorsNeedingCalibration = await this.sensorRepository
        .createQueryBuilder('sensor')
        .leftJoinAndSelect('sensor.tank', 'tank')
        .where('sensor.nextCalibrationDate <= :now', { now })
        .orWhere('sensor.calibrationDate IS NULL')
        .getMany();

      for (const sensor of sensorsNeedingCalibration) {
        await this.createCalibrationAlert(sensor);
      }

    } catch (error) {
      this.logger.error('Erro ao verificar manutenções:', error);
    }
  }

  async checkSensorErrorAlerts(): Promise<void> {
    try {
      // Buscar sensores com muitos erros
      const sensorsWithErrors = await this.sensorRepository
        .createQueryBuilder('sensor')
        .leftJoinAndSelect('sensor.tank', 'tank')
        .where('sensor.errorCount > :maxErrors', { maxErrors: 10 })
        .getMany();

      for (const sensor of sensorsWithErrors) {
        await this.createSensorErrorAlert(sensor);
      }

    } catch (error) {
      this.logger.error('Erro ao verificar erros de sensor:', error);
    }
  }

  // Cron jobs para verificações automáticas
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPeriodicAlertChecks(): Promise<void> {
    this.logger.debug('Executando verificações periódicas de alertas...');

    await Promise.allSettled([
      this.checkSensorOfflineAlerts(),
      this.checkLowBatteryAlerts(),
      this.checkMaintenanceAlerts(),
      this.checkSensorErrorAlerts(),
    ]);

    this.logger.debug('Verificações periódicas de alertas concluídas');
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldAlertData(): Promise<void> {
    try {
      // Limpar dados antigos de cooldown (mais de 24 horas)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const keysToDelete: string[] = [];

      this.lastAlertTimes.forEach((timestamp, key) => {
        if (timestamp < oneDayAgo) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach(key => this.lastAlertTimes.delete(key));

      if (keysToDelete.length > 0) {
        this.logger.debug(`Limpos ${keysToDelete.length} registros de cooldown antigos`);
      }

    } catch (error) {
      this.logger.error('Erro ao limpar dados antigos de alertas:', error);
    }
  }

  private async createAlertIfNotCooldown(
    rule: AlertRule,
    tank: Tank,
    sensor?: Sensor,
    reading?: Reading
  ): Promise<void> {
    const alertKey = `${rule.type}_${tank.id}_${sensor?.id || 'tank'}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Verificar cooldown
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60); // minutos
      if (timeSinceLastAlert < rule.cooldown) {
        return; // Ainda em cooldown
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        rule.type,
        rule.severity,
        tank.id,
        sensor?.id,
        reading?.level,
        reading?.volume,
        this.getThresholdValue(rule.type, tank),
        {
          readingId: reading?.id,
          sensorId: sensor?.id,
          rule: rule.type,
        }
      );

      // Atualizar timestamp do último alerta
      this.lastAlertTimes.set(alertKey, now);

      this.logger.log(
        `Alerta criado: ${rule.type} para tanque ${tank.name} (severidade: ${rule.severity})`
      );

    } catch (error) {
      this.logger.error(`Erro ao criar alerta ${rule.type} para tanque ${tank.id}:`, error);
    }
  }

  private async createOfflineAlert(sensor: Sensor): Promise<void> {
    const alertKey = `offline_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 30 minutos para alertas offline
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < 30) {
        return;
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        AlertType.SENSOR_OFFLINE,
        AlertSeverity.HIGH,
        sensor.tankId,
        sensor.id,
        undefined,
        undefined,
        undefined,
        {
          sensorId: sensor.id,
          lastTransmission: sensor.lastTransmissionAt,
          timeOffline: sensor.lastTransmissionAt
            ? Math.round((now.getTime() - sensor.lastTransmissionAt.getTime()) / (1000 * 60))
            : 'unknown',
        }
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta offline criado para sensor ${sensor.sensorId}`);

    } catch (error) {
      this.logger.error(`Erro ao criar alerta offline para sensor ${sensor.id}:`, error);
    }
  }

  private async createLowBatteryAlert(sensor: Sensor): Promise<void> {
    const alertKey = `battery_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 2 horas para alertas de bateria
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < 120) {
        return;
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        AlertType.BATTERY_LOW,
        AlertSeverity.MEDIUM,
        sensor.tankId,
        sensor.id,
        undefined,
        undefined,
        undefined,
        {
          sensorId: sensor.id,
          batteryLevel: sensor.batteryLevel,
          lastUpdate: sensor.batteryLastUpdate,
        }
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta bateria baixa criado para sensor ${sensor.sensorId}`);

    } catch (error) {
      this.logger.error(`Erro ao criar alerta bateria baixa para sensor ${sensor.id}:`, error);
    }
  }

  private async createMaintenanceAlert(tank: Tank): Promise<void> {
    const alertKey = `maintenance_${tank.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 24 horas para alertas de manutenção
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < 1440) {
        return;
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        AlertType.MAINTENANCE_DUE,
        AlertSeverity.LOW,
        tank.id,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          tankId: tank.id,
          lastMaintenance: tank.lastMaintenanceDate,
          nextMaintenance: tank.nextMaintenanceDate,
        }
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta manutenção criado para tanque ${tank.name}`);

    } catch (error) {
      this.logger.error(`Erro ao criar alerta manutenção para tanque ${tank.id}:`, error);
    }
  }

  private async createCalibrationAlert(sensor: Sensor): Promise<void> {
    const alertKey = `calibration_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 24 horas para alertas de calibração
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < 1440) {
        return;
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        AlertType.CALIBRATION_DUE,
        AlertSeverity.LOW,
        sensor.tankId,
        sensor.id,
        undefined,
        undefined,
        undefined,
        {
          sensorId: sensor.id,
          lastCalibration: sensor.calibrationDate,
          nextCalibration: sensor.nextCalibrationDate,
        }
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta calibração criado para sensor ${sensor.sensorId}`);

    } catch (error) {
      this.logger.error(`Erro ao criar alerta calibração para sensor ${sensor.id}:`, error);
    }
  }

  private async createSensorErrorAlert(sensor: Sensor): Promise<void> {
    const alertKey = `error_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 1 hora para alertas de erro
    if (lastAlertTime) {
      const timeSinceLastAlert = (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < 60) {
        return;
      }
    }

    try {
      await this.alertsService.createAutomaticAlert(
        AlertType.SENSOR_ERROR,
        AlertSeverity.HIGH,
        sensor.tankId,
        sensor.id,
        undefined,
        undefined,
        undefined,
        {
          sensorId: sensor.id,
          errorCount: sensor.errorCount,
          lastError: sensor.lastErrorAt,
          lastErrorMessage: sensor.lastErrorMessage,
        }
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta erro criado para sensor ${sensor.sensorId}`);

    } catch (error) {
      this.logger.error(`Erro ao criar alerta erro para sensor ${sensor.id}:`, error);
    }
  }

  private getThresholdValue(type: AlertType, tank: Tank): number | undefined {
    switch (type) {
      case AlertType.HIGH_LEVEL:
        return tank.maxLevelThreshold || undefined;
      case AlertType.LOW_LEVEL:
        return tank.minLevelThreshold || undefined;
      case AlertType.OVERFLOW_RISK:
        return tank.overflowThreshold || undefined;
      case AlertType.LOW_LEVEL:
        return tank.lowLevelThreshold || undefined;
      default:
        return undefined;
    }
  }

  // Método para configurar regras de alerta dinamicamente
  setAlertRules(rules: AlertRule[]): void {
    this.alertRules = rules;
    this.logger.log(`Regras de alerta atualizadas: ${rules.length} regras configuradas`);
  }

  // Método para obter estatísticas do processador
  getStats(): any {
    return {
      activeRules: this.alertRules.length,
      cooldownEntries: this.lastAlertTimes.size,
      rulesByType: this.alertRules.reduce((acc, rule) => {
        acc[rule.type] = (acc[rule.type] || 0) + 1;
        return acc;
      }, {}),
    };
  }
}
