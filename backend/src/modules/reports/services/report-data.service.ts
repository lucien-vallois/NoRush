import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { Tank } from '../../../entities/tank.entity';
import { Sensor } from '../../../entities/sensor.entity';
import { Reading } from '../../../entities/reading.entity';
import { Alert, AlertSeverity, AlertType } from '../../../entities/alert.entity';
import { ReportType } from '../dto/generate-report.dto';

interface ReportData {
  metadata: {
    title: string;
    generatedAt: Date;
    period: {
      start: Date;
      end: Date;
    };
    filters: any;
  };
  summary: any;
  data: any;
  charts?: any;
}

@Injectable()
export class ReportDataService {
  private readonly logger = new Logger(ReportDataService.name);

  constructor(
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Reading)
    private readingRepository: Repository<Reading>,
    @InjectRepository(Alert)
    private alertRepository: Repository<Alert>,
  ) {}

  async generateReportData(
    type: ReportType,
    filters: {
      startDate?: Date;
      endDate?: Date;
      tankIds?: string[];
      sensorIds?: string[];
      parameters?: Record<string, any>;
    },
    customTitle?: string,
  ): Promise<ReportData> {
    const startDate = filters.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 dias atrás
    const endDate = filters.endDate || new Date();

    const metadata = {
      title: customTitle || this.getDefaultTitle(type),
      generatedAt: new Date(),
      period: { start: startDate, end: endDate },
      filters,
    };

    try {
      switch (type) {
        case ReportType.TANK_LEVEL_HISTORY:
          return {
            metadata,
            ...await this.generateTankLevelHistoryData(startDate, endDate, filters),
          };

        case ReportType.SENSOR_PERFORMANCE:
          return {
            metadata,
            ...await this.generateSensorPerformanceData(startDate, endDate, filters),
          };

        case ReportType.ALERT_SUMMARY:
          return {
            metadata,
            ...await this.generateAlertSummaryData(startDate, endDate, filters),
          };

        case ReportType.SYSTEM_OVERVIEW:
          return {
            metadata,
            ...await this.generateSystemOverviewData(startDate, endDate, filters),
          };

        case ReportType.MAINTENANCE_SCHEDULE:
          return {
            metadata,
            ...await this.generateMaintenanceScheduleData(),
          };

        case ReportType.PRODUCTION_ANALYSIS:
          return {
            metadata,
            ...await this.generateProductionAnalysisData(startDate, endDate, filters),
          };

        default:
          throw new Error(`Tipo de relatório não suportado: ${type}`);
      }
    } catch (error) {
      this.logger.error(`Erro ao gerar dados do relatório ${type}:`, error);
      throw error;
    }
  }

  private async generateTankLevelHistoryData(
    startDate: Date,
    endDate: Date,
    filters: any,
  ): Promise<{ summary: any; data: any; charts: any }> {
    // Buscar tanques
    const tanks = await this.getFilteredTanks(filters.tankIds);

    const tankData: any[] = [];
    let totalReadings = 0;
    let avgLevel = 0;
    let minLevel = Infinity;
    let maxLevel = -Infinity;

    for (const tank of tanks) {
      const readings = await this.readingRepository
        .createQueryBuilder('reading')
        .leftJoin('reading.sensor', 'sensor')
        .where('sensor.tankId = :tankId', { tankId: tank.id })
        .andWhere('reading.timestamp BETWEEN :startDate AND :endDate', {
          startDate,
          endDate,
        })
        .orderBy('reading.timestamp', 'ASC')
        .getMany();

      if (readings.length === 0) continue;

      const tankStats = {
        tankId: tank.id,
        tankName: tank.name,
        tankCode: tank.code,
        totalReadings: readings.length,
        avgLevel: readings.reduce((sum, r) => sum + r.level, 0) / readings.length,
        minLevel: Math.min(...readings.map(r => r.level)),
        maxLevel: Math.max(...readings.map(r => r.level)),
        readings: readings.map(r => ({
          timestamp: r.timestamp,
          level: r.level,
          volume: r.volume,
          quality: r.quality,
        })),
      };

      tankData.push(tankStats);
      totalReadings += readings.length;
      avgLevel += tankStats.avgLevel;
      minLevel = Math.min(minLevel, tankStats.minLevel);
      maxLevel = Math.max(maxLevel, tankStats.maxLevel);
    }

    avgLevel = tankData.length > 0 ? avgLevel / tankData.length : 0;

    return {
      summary: {
        totalTanks: tankData.length,
        totalReadings,
        avgLevel: Math.round(avgLevel * 100) / 100,
        minLevel: minLevel === Infinity ? 0 : Math.round(minLevel * 100) / 100,
        maxLevel: maxLevel === -Infinity ? 0 : Math.round(maxLevel * 100) / 100,
        periodDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      data: tankData,
      charts: {
        levelTrends: tankData.map(tank => ({
          name: tank.tankName,
          data: tank.readings.map(r => ({
            x: r.timestamp.toISOString(),
            y: r.level,
          })),
        })),
      },
    };
  }

  private async generateSensorPerformanceData(
    startDate: Date,
    endDate: Date,
    filters: any,
  ): Promise<{ summary: any; data: any; charts: any }> {
    // Buscar sensores
    const sensors = await this.getFilteredSensors(filters.sensorIds);

    const sensorData: any[] = [];
    let totalReadings = 0;
    let avgQuality = 0;
    let totalErrors = 0;

    for (const sensor of sensors) {
      const readings = await this.readingRepository.find({
        where: {
          sensorId: sensor.id,
          timestamp: Between(startDate, endDate) as any,
        },
        order: { timestamp: 'ASC' },
      });

      if (readings.length === 0) continue;

      const qualityAvg = readings.reduce((sum, r) => sum + (r.quality || 0), 0) / readings.length;
      const errorCount = readings.filter(r => (r.quality || 0) < 50).length;

      const sensorStats = {
        sensorId: sensor.id,
        sensorName: sensor.name,
        sensorType: sensor.type,
        tankName: sensor.tank?.name,
        totalReadings: readings.length,
        avgQuality: Math.round(qualityAvg * 100) / 100,
        errorCount,
        errorRate: readings.length > 0 ? Math.round((errorCount / readings.length) * 10000) / 100 : 0,
        transmissionCount: sensor.transmissionCount,
        lastTransmission: sensor.lastTransmissionAt,
        batteryLevel: sensor.batteryLevel,
        isOnline: sensor.isOnline(),
      };

      sensorData.push(sensorStats);
      totalReadings += readings.length;
      avgQuality += qualityAvg;
      totalErrors += errorCount;
    }

    avgQuality = sensorData.length > 0 ? avgQuality / sensorData.length : 0;

    return {
      summary: {
        totalSensors: sensorData.length,
        totalReadings,
        avgQuality: Math.round(avgQuality * 100) / 100,
        totalErrors,
        errorRate: totalReadings > 0 ? Math.round((totalErrors / totalReadings) * 10000) / 100 : 0,
        onlineSensors: sensorData.filter(s => s.isOnline).length,
        offlineSensors: sensorData.filter(s => !s.isOnline).length,
      },
      data: sensorData,
      charts: {
        qualityDistribution: sensorData.map(sensor => ({
          name: sensor.sensorName,
          quality: sensor.avgQuality,
          errors: sensor.errorCount,
        })),
        onlineStatus: [
          {
            name: 'Online',
            value: sensorData.filter(s => s.isOnline).length,
          },
          {
            name: 'Offline',
            value: sensorData.filter(s => !s.isOnline).length,
          },
        ],
      },
    };
  }

  private async generateAlertSummaryData(
    startDate: Date,
    endDate: Date,
    filters: any,
  ): Promise<{ summary: any; data: any; charts: any }> {
    // Buscar alertas
    let queryBuilder = this.alertRepository
      .createQueryBuilder('alert')
      .leftJoinAndSelect('alert.tank', 'tank')
      .leftJoinAndSelect('alert.sensor', 'sensor')
      .where('alert.createdAt BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });

    if (filters.tankIds?.length > 0) {
      queryBuilder.andWhere('alert.tankId IN (:...tankIds)', {
        tankIds: filters.tankIds,
      });
    }

    if (filters.sensorIds?.length > 0) {
      queryBuilder.andWhere('alert.sensorId IN (:...sensorIds)', {
        sensorIds: filters.sensorIds,
      });
    }

    const alerts = await queryBuilder
      .orderBy('alert.createdAt', 'DESC')
      .getMany();

    // Estatísticas
    const alertsByType = alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsBySeverity = alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsByStatus = alerts.reduce((acc, alert) => {
      acc[alert.status] = (acc[alert.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Tempo médio de resolução
    const resolvedAlerts = alerts.filter(a => a.resolvedAt && a.createdAt);
    const avgResolutionTime = resolvedAlerts.length > 0
      ? resolvedAlerts.reduce((sum, alert) => {
          return sum + (alert.resolvedAt!.getTime() - alert.createdAt.getTime());
        }, 0) / resolvedAlerts.length / (1000 * 60 * 60) // em horas
      : 0;

    return {
      summary: {
        totalAlerts: alerts.length,
        resolvedAlerts: alerts.filter(a => a.status === 'resolved').length,
        activeAlerts: alerts.filter(a => a.status === 'active').length,
        acknowledgedAlerts: alerts.filter(a => a.status === 'acknowledged').length,
        avgResolutionTime: Math.round(avgResolutionTime * 100) / 100,
        criticalAlerts: alerts.filter(a => a.severity === AlertSeverity.CRITICAL).length,
        periodDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      },
      data: alerts.map(alert => ({
        id: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        status: alert.status,
        tankName: alert.tank?.name,
        sensorName: alert.sensorId,
        createdAt: alert.createdAt,
        resolvedAt: alert.resolvedAt,
        acknowledgedAt: alert.acknowledgedAt,
        currentLevel: alert.currentLevel,
        currentVolume: alert.currentVolume,
        thresholdValue: alert.thresholdValue,
      })),
      charts: {
        alertsByType: Object.entries(alertsByType).map(([type, count]) => ({
          type,
          count,
        })),
        alertsBySeverity: Object.entries(alertsBySeverity).map(([severity, count]) => ({
          severity,
          count,
        })),
        alertsOverTime: this.groupAlertsByDate(alerts),
      },
    };
  }

  private async generateSystemOverviewData(
    startDate: Date,
    endDate: Date,
    filters: any,
  ): Promise<{ summary: any; data: any; charts: any }> {
    // Dados gerais do sistema
    const tanks = await this.tankRepository.find({ relations: ['sensors'] });
    const sensors = await this.sensorRepository.find({ relations: ['tank'] });
    const totalReadings = await this.readingRepository.count({
      where: {
        timestamp: Between(startDate, endDate) as any,
      },
    });
    const totalAlerts = await this.alertRepository.count({
      where: {
        createdAt: Between(startDate, endDate) as any,
      },
    });

    const onlineSensors = sensors.filter(s => s.isOnline()).length;
    const offlineSensors = sensors.length - onlineSensors;

    const systemHealth = {
      tanks: {
        total: tanks.length,
        active: tanks.filter(t => t.status === 'active').length,
        maintenance: tanks.filter(t => t.status === 'maintenance').length,
        error: tanks.filter(t => t.status === 'error').length,
      },
      sensors: {
        total: sensors.length,
        online: onlineSensors,
        offline: offlineSensors,
        byType: sensors.reduce((acc, sensor) => {
          acc[sensor.type] = (acc[sensor.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      },
      readings: {
        total: totalReadings,
        avgPerDay: Math.round(totalReadings / Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))),
      },
      alerts: {
        total: totalAlerts,
        avgPerDay: Math.round(totalAlerts / Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)))),
        critical: await this.alertRepository.count({
          where: {
            severity: AlertSeverity.CRITICAL,
            createdAt: Between(startDate, endDate) as any,
          },
        }),
      },
    };

    return {
      summary: systemHealth,
      data: {
        tanks: tanks.map(tank => ({
          id: tank.id,
          name: tank.name,
          code: tank.code,
          status: tank.status,
          sensorCount: tank.sensors?.length || 0,
          latitude: tank.latitude,
          longitude: tank.longitude,
        })),
        sensors: sensors.map(sensor => ({
          id: sensor.id,
          name: sensor.name,
          type: sensor.type,
          status: sensor.status,
          tankName: sensor.tank?.name,
          isOnline: sensor.isOnline(),
          batteryLevel: sensor.batteryLevel,
          lastTransmission: sensor.lastTransmissionAt,
        })),
      },
      charts: {
        systemStatus: [
          { name: 'Tanques Ativos', value: systemHealth.tanks.active },
          { name: 'Tanques em Manutenção', value: systemHealth.tanks.maintenance },
          { name: 'Tanques com Erro', value: systemHealth.tanks.error },
        ],
        sensorStatus: [
          { name: 'Sensores Online', value: systemHealth.sensors.online },
          { name: 'Sensores Offline', value: systemHealth.sensors.offline },
        ],
        sensorTypes: Object.entries(systemHealth.sensors.byType).map(([type, count]) => ({
          type,
          count,
        })),
      },
    };
  }

  private async generateMaintenanceScheduleData(): Promise<{ summary: any; data: any }> {
    // Tanques que precisam de manutenção
    const tanksNeedingMaintenance = await this.tankRepository
      .createQueryBuilder('tank')
      .where('tank.nextMaintenanceDate <= :now', { now: new Date() })
      .orWhere('tank.lastMaintenanceDate IS NULL')
      .orderBy('tank.nextMaintenanceDate', 'ASC')
      .getMany();

    // Sensores que precisam de calibração
    const sensorsNeedingCalibration = await this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('sensor.nextCalibrationDate <= :now', { now: new Date() })
      .orWhere('sensor.calibrationDate IS NULL')
      .orderBy('sensor.nextCalibrationDate', 'ASC')
      .getMany();

    // Sensores com bateria baixa
    const lowBatterySensors = await this.sensorRepository
      .createQueryBuilder('sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('sensor.batteryLevel <= :lowBatteryThreshold', { lowBatteryThreshold: 20 })
      .andWhere('sensor.batteryLevel IS NOT NULL')
      .orderBy('sensor.batteryLevel', 'ASC')
      .getMany();

    return {
      summary: {
        tanksNeedingMaintenance: tanksNeedingMaintenance.length,
        sensorsNeedingCalibration: sensorsNeedingCalibration.length,
        lowBatterySensors: lowBatterySensors.length,
        totalItems: tanksNeedingMaintenance.length + sensorsNeedingCalibration.length + lowBatterySensors.length,
      },
      data: {
        tanks: tanksNeedingMaintenance.map(tank => ({
          id: tank.id,
          name: tank.name,
          code: tank.code,
          type: 'tank',
          priority: tank.nextMaintenanceDate
            ? this.calculatePriority(tank.nextMaintenanceDate)
            : 'high',
          lastMaintenance: tank.lastMaintenanceDate,
          nextMaintenance: tank.nextMaintenanceDate,
          description: 'Manutenção preventiva do tanque',
        })),
        sensors: [
          ...sensorsNeedingCalibration.map(sensor => ({
            id: sensor.id,
            name: sensor.name,
            tankName: sensor.tank?.name,
            type: 'calibration',
            priority: sensor.nextCalibrationDate
              ? this.calculatePriority(sensor.nextCalibrationDate)
              : 'high',
            lastMaintenance: sensor.calibrationDate,
            nextMaintenance: sensor.nextCalibrationDate,
            description: 'Calibração do sensor',
          })),
          ...lowBatterySensors.map(sensor => ({
            id: sensor.id,
            name: sensor.name,
            tankName: sensor.tank?.name,
            type: 'battery',
            priority: sensor.batteryLevel && sensor.batteryLevel <= 10 ? 'critical' : 'high',
            batteryLevel: sensor.batteryLevel,
            description: 'Substituir bateria do sensor',
          })),
        ],
      },
    };
  }

  private async generateProductionAnalysisData(
    startDate: Date,
    endDate: Date,
    filters: any,
  ): Promise<{ summary: any; data: any; charts: any }> {
    // Análise de produção baseada nos volumes
    const readings = await this.readingRepository
      .createQueryBuilder('reading')
      .leftJoinAndSelect('reading.sensor', 'sensor')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('reading.timestamp BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .andWhere('reading.volume IS NOT NULL')
      .orderBy('reading.timestamp', 'ASC')
      .getMany();

    // Agrupar por tanque e calcular métricas
    const tankProduction = new Map();

    for (const reading of readings) {
      const tankId = reading.sensor?.tankId;
      if (!tankId || !reading.volume) continue;

      if (!tankProduction.has(tankId)) {
        tankProduction.set(tankId, {
          tankId,
          tankName: reading.sensor?.tank?.name || 'Desconhecido',
          readings: [],
          totalVolume: 0,
          avgVolume: 0,
          minVolume: Infinity,
          maxVolume: -Infinity,
          volumeVariation: 0,
        });
      }

      const tankData = tankProduction.get(tankId);
      tankData.readings.push(reading);
      tankData.totalVolume += reading.volume;
      tankData.minVolume = Math.min(tankData.minVolume, reading.volume);
      tankData.maxVolume = Math.max(tankData.maxVolume, reading.volume);
    }

    // Calcular médias e variações
    const productionData = Array.from(tankProduction.values()).map(tankData => {
      const count = tankData.readings.length;
      tankData.avgVolume = count > 0 ? tankData.totalVolume / count : 0;
      tankData.volumeVariation = tankData.maxVolume - tankData.minVolume;

      return {
        tankId: tankData.tankId,
        tankName: tankData.tankName,
        totalReadings: count,
        totalVolume: Math.round(tankData.totalVolume * 100) / 100,
        avgVolume: Math.round(tankData.avgVolume * 100) / 100,
        minVolume: Math.round(tankData.minVolume * 100) / 100,
        maxVolume: Math.round(tankData.maxVolume * 100) / 100,
        volumeVariation: Math.round(tankData.volumeVariation * 100) / 100,
        efficiency: this.calculateEfficiency(tankData),
      };
    });

    const totalProduction = productionData.reduce((sum, tank) => sum + tank.totalVolume, 0);
    const avgEfficiency = productionData.length > 0
      ? productionData.reduce((sum, tank) => sum + tank.efficiency, 0) / productionData.length
      : 0;

    return {
      summary: {
        totalTanks: productionData.length,
        totalProduction: Math.round(totalProduction * 100) / 100,
        avgEfficiency: Math.round(avgEfficiency * 100) / 100,
        periodDays: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
        totalReadings: readings.length,
      },
      data: productionData,
      charts: {
        productionByTank: productionData.map(tank => ({
          name: tank.tankName,
          value: tank.totalVolume,
        })),
        efficiencyByTank: productionData.map(tank => ({
          name: tank.tankName,
          efficiency: tank.efficiency,
        })),
      },
    };
  }

  private async getFilteredTanks(tankIds?: string[]): Promise<Tank[]> {
    if (tankIds && tankIds.length > 0) {
      return this.tankRepository.find({
        where: tankIds.map(id => ({ id })),
        relations: ['sensors'],
      });
    }
    return this.tankRepository.find({ relations: ['sensors'] });
  }

  private async getFilteredSensors(sensorIds?: string[]): Promise<Sensor[]> {
    if (sensorIds && sensorIds.length > 0) {
      return this.sensorRepository.find({
        where: sensorIds.map(id => ({ id })),
        relations: ['tank'],
      });
    }
    return this.sensorRepository.find({ relations: ['tank'] });
  }

  private getDefaultTitle(type: ReportType): string {
    const titles = {
      [ReportType.TANK_LEVEL_HISTORY]: 'Histórico de Níveis dos Tanques',
      [ReportType.SENSOR_PERFORMANCE]: 'Performance dos Sensores',
      [ReportType.ALERT_SUMMARY]: 'Resumo de Alertas',
      [ReportType.SYSTEM_OVERVIEW]: 'Visão Geral do Sistema',
      [ReportType.MAINTENANCE_SCHEDULE]: 'Cronograma de Manutenção',
      [ReportType.PRODUCTION_ANALYSIS]: 'Análise de Produção',
    };
    return titles[type] || 'Relatório do Sistema';
  }

  private calculatePriority(dueDate: Date): 'low' | 'medium' | 'high' | 'critical' {
    const now = new Date();
    const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilDue < 0) return 'critical'; // Vencido
    if (daysUntilDue <= 7) return 'high';    // 7 dias ou menos
    if (daysUntilDue <= 30) return 'medium'; // 30 dias ou menos
    return 'low'; // Mais de 30 dias
  }

  private calculateEfficiency(tankData: any): number {
    // Eficiência baseada na consistência dos volumes
    if (tankData.readings.length < 2) return 100;

    const volumes = tankData.readings.map(r => r.volume);
    const avgVolume = tankData.avgVolume;
    const variations = volumes.map(v => Math.abs(v - avgVolume));
    const avgVariation = variations.reduce((sum, v) => sum + v, 0) / variations.length;

    // Eficiência = 100 - (variação média / volume médio * 100)
    const efficiency = Math.max(0, 100 - (avgVariation / avgVolume * 100));
    return Math.round(efficiency * 100) / 100;
  }

  private groupAlertsByDate(alerts: Alert[]): any[] {
    const grouped = alerts.reduce((acc, alert) => {
      const date = alert.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = { date, count: 0, bySeverity: {} };
      }
      acc[date].count++;
      acc[date].bySeverity[alert.severity] = (acc[date].bySeverity[alert.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, any>);

    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }
}
