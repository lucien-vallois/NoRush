import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AlertType, AlertSeverity } from '../../entities/alert.entity';
import { Tank } from '../../entities/tank.entity';
import { Sensor, SensorStatus } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { AlertsService } from './alerts.service';
import { evaluateLevelAlarms, LevelAlarm, LevelAlarmKey } from './level-alarms';

/** Minutes between two alerts for the same level alarm on the same gauge. */
const LEVEL_ALARM_COOLDOWN_MIN: Record<LevelAlarmKey, number> = {
  overflow: 15,
  minimum: 15,
  high: 30,
  low: 30,
};

@Injectable()
export class AlertProcessorService {
  private readonly logger = new Logger(AlertProcessorService.name);
  private lastAlertTimes = new Map<string, Date>();

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
        relations: { tank: true },
      });

      if (!sensor || !sensor.tank) {
        return; // Não há tanque associado
      }

      const tank = sensor.tank;

      for (const alarm of evaluateLevelAlarms(tank, reading.level)) {
        await this.createLevelAlertIfNotCooldown(alarm, tank, sensor, reading);
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar alertas para leitura ${reading.id}:`,
        error,
      );
    }
  }

  async checkSensorOfflineAlerts(): Promise<void> {
    try {
      // Buscar sensores ativos
      const sensors = await this.sensorRepository.find({
        where: { status: SensorStatus.ACTIVE },
        relations: { tank: true },
      });

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      for (const sensor of sensors) {
        // Verificar se o sensor está offline
        if (
          !sensor.lastTransmissionAt ||
          sensor.lastTransmissionAt < fiveMinutesAgo
        ) {
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
        .where('sensor.batteryLevel <= :lowBatteryThreshold', {
          lowBatteryThreshold: 20,
        })
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

      // Only a scheduled date that has passed is "due": a tank or gauge with
      // no schedule yet is not overdue, it is just not on a maintenance plan.
      const tanksNeedingMaintenance = await this.tankRepository
        .createQueryBuilder('tank')
        .where('tank.nextMaintenanceDate <= :now', { now })
        .getMany();

      for (const tank of tanksNeedingMaintenance) {
        await this.createMaintenanceAlert(tank);
      }

      // Sensores que precisam de calibração
      const sensorsNeedingCalibration = await this.sensorRepository
        .createQueryBuilder('sensor')
        .leftJoinAndSelect('sensor.tank', 'tank')
        .where('sensor.nextCalibrationDate <= :now', { now })
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

      keysToDelete.forEach((key) => this.lastAlertTimes.delete(key));

      if (keysToDelete.length > 0) {
        this.logger.debug(
          `Limpos ${keysToDelete.length} registros de cooldown antigos`,
        );
      }
    } catch (error) {
      this.logger.error('Erro ao limpar dados antigos de alertas:', error);
    }
  }

  private async createLevelAlertIfNotCooldown(
    alarm: LevelAlarm,
    tank: Tank,
    sensor: Sensor,
    reading: Reading,
  ): Promise<void> {
    // One cooldown per alarm (not per alert type): low and minimum are both
    // LOW_LEVEL, and the minimum alarm must not be muted by the low one.
    const alertKey = `level:${alarm.key}_${tank.id}_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    if (lastAlertTime) {
      const minutesSinceLast =
        (now.getTime() - lastAlertTime.getTime()) / 60000;
      if (minutesSinceLast < LEVEL_ALARM_COOLDOWN_MIN[alarm.key]) return;
    }

    try {
      await this.alertsService.createAutomaticAlert(
        alarm.type,
        alarm.severity,
        tank.id,
        sensor.id,
        reading.level,
        reading.volume,
        alarm.threshold,
        {
          readingId: reading.id,
          sensorId: sensor.id,
          rule: alarm.key,
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(
        `Level alarm ${alarm.key} on tank ${tank.name} (${alarm.reason}, severity ${alarm.severity})`,
      );
    } catch (error) {
      this.logger.error(
        `Could not create level alarm ${alarm.key} for tank ${tank.id}:`,
        error,
      );
    }
  }

  private async createOfflineAlert(sensor: Sensor): Promise<void> {
    const alertKey = `offline_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 30 minutos para alertas offline
    if (lastAlertTime) {
      const timeSinceLastAlert =
        (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
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
            ? Math.round(
                (now.getTime() - sensor.lastTransmissionAt.getTime()) /
                  (1000 * 60),
              )
            : 'unknown',
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta offline criado para sensor ${sensor.sensorId}`);
    } catch (error) {
      this.logger.error(
        `Erro ao criar alerta offline para sensor ${sensor.id}:`,
        error,
      );
    }
  }

  private async createLowBatteryAlert(sensor: Sensor): Promise<void> {
    const alertKey = `battery_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 2 horas para alertas de bateria
    if (lastAlertTime) {
      const timeSinceLastAlert =
        (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
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
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(
        `Alerta bateria baixa criado para sensor ${sensor.sensorId}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao criar alerta bateria baixa para sensor ${sensor.id}:`,
        error,
      );
    }
  }

  private async createMaintenanceAlert(tank: Tank): Promise<void> {
    const alertKey = `maintenance_${tank.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 24 horas para alertas de manutenção
    if (lastAlertTime) {
      const timeSinceLastAlert =
        (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
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
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta manutenção criado para tanque ${tank.name}`);
    } catch (error) {
      this.logger.error(
        `Erro ao criar alerta manutenção para tanque ${tank.id}:`,
        error,
      );
    }
  }

  private async createCalibrationAlert(sensor: Sensor): Promise<void> {
    const alertKey = `calibration_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 24 horas para alertas de calibração
    if (lastAlertTime) {
      const timeSinceLastAlert =
        (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
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
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(
        `Alerta calibração criado para sensor ${sensor.sensorId}`,
      );
    } catch (error) {
      this.logger.error(
        `Erro ao criar alerta calibração para sensor ${sensor.id}:`,
        error,
      );
    }
  }

  private async createSensorErrorAlert(sensor: Sensor): Promise<void> {
    const alertKey = `error_${sensor.id}`;
    const lastAlertTime = this.lastAlertTimes.get(alertKey);
    const now = new Date();

    // Cooldown de 1 hora para alertas de erro
    if (lastAlertTime) {
      const timeSinceLastAlert =
        (now.getTime() - lastAlertTime.getTime()) / (1000 * 60);
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
        },
      );

      this.lastAlertTimes.set(alertKey, now);
      this.logger.log(`Alerta erro criado para sensor ${sensor.sensorId}`);
    } catch (error) {
      this.logger.error(
        `Erro ao criar alerta erro para sensor ${sensor.id}:`,
        error,
      );
    }
  }

  getStats() {
    return {
      levelAlarms: LEVEL_ALARM_COOLDOWN_MIN,
      cooldownEntries: this.lastAlertTimes.size,
    };
  }
}
