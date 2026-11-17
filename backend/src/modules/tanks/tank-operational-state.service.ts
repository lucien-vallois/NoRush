import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  heartbeatFreshness,
  readingFreshness,
  TelemetryFreshness,
} from '../../common/telemetry-freshness';
import { OilWaterInterface } from '../../entities/reading.entity';
import { TankStatus } from '../../entities/tank.entity';
import {
  PredictionsService,
  TankForecast,
} from '../predictions/predictions.service';
import { tankLevelSensorSql } from './tank-level-sensor.query';

export interface TankOperationalState {
  tankId: string;
  tankStatus: TankStatus;
  sensorId: string | null;
  sensorType: string | null;
  level: number | null;
  oilWaterInterface: OilWaterInterface | null;
  readingTimestamp: string | null;
  readingFreshness: TelemetryFreshness;
  heartbeat: TelemetryFreshness & { timestamp: string | null };
  criticalAlarmOpen: boolean;
  forecast: TankForecast | null;
  forecastError: boolean;
}

export interface TankFleetOperationalState {
  generatedAt: string;
  tanks: TankOperationalState[];
}

interface SelectedTankRow {
  id: string;
  status: TankStatus;
  sensor_uuid: string | null;
  sensor_type: string | null;
  lastTransmissionAt: Date | string | null;
}

interface LatestReadingRow {
  sensorId: string;
  level: number | string | null;
  oilWaterInterface: OilWaterInterface | null;
  timestamp: Date | string;
}

@Injectable()
export class TankOperationalStateService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly predictionsService: PredictionsService,
  ) {}

  async findAllStates(): Promise<TankFleetOperationalState> {
    const asOf = new Date();
    const tanks: SelectedTankRow[] = await this.dataSource.query(
      tankLevelSensorSql('TRUE', 'state'),
    );
    let forecasts: TankForecast[] = [];
    let forecastFailed = false;
    try {
      forecasts = await this.predictionsService.computeAllForecasts();
    } catch {
      forecastFailed = true;
    }
    return {
      generatedAt: asOf.toISOString(),
      tanks: await this.buildStates(tanks, forecasts, asOf, forecastFailed),
    };
  }

  async findStateByTank(tankId: string): Promise<TankOperationalState> {
    const asOf = new Date();
    const tanks: SelectedTankRow[] = await this.dataSource.query(
      tankLevelSensorSql('t.id = $1', 'state'),
      [tankId],
    );
    if (!tanks.length) {
      throw new NotFoundException({ code: 'tankNotFound', id: tankId });
    }

    const tank = tanks[0];
    let forecast: TankForecast | null = null;
    let forecastFailed = false;
    if (tank.status === TankStatus.ACTIVE && tank.sensor_uuid) {
      try {
        forecast = await this.predictionsService.computeForecastForTank(tankId);
      } catch {
        forecastFailed = true;
      }
    }
    const states = await this.buildStates(
      tanks,
      forecast ? [forecast] : [],
      asOf,
      forecastFailed,
    );
    return states[0];
  }

  private async buildStates(
    tanks: SelectedTankRow[],
    forecasts: TankForecast[],
    asOf: Date,
    forecastFailed: boolean,
  ): Promise<TankOperationalState[]> {
    const sensorIds = tanks
      .map((tank) => tank.sensor_uuid)
      .filter((sensorId): sensorId is string => Boolean(sensorId));
    const tankIds = tanks.map((tank) => tank.id);

    const [readings, criticalAlarms]: [
      LatestReadingRow[],
      { tankId: string }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT DISTINCT ON ("sensorId")
                  "sensorId", level, "oilWaterInterface", "timestamp"
           FROM readings
           WHERE "sensorId" = ANY($1::uuid[]) AND "timestamp" <= $2
           ORDER BY "sensorId", "timestamp" DESC`,
        [sensorIds, asOf],
      ),
      this.dataSource.query(
        `SELECT DISTINCT "tankId" FROM alerts
           WHERE "tankId" = ANY($1::uuid[])
             AND severity = 'critical' AND status IN ('active', 'acknowledged')`,
        [tankIds],
      ),
    ]);

    const readingsBySensor = new Map(
      readings.map((reading) => [reading.sensorId, reading]),
    );
    const criticalTankIds = new Set(
      criticalAlarms.map((alarm) => alarm.tankId),
    );
    const forecastsByTank = new Map(
      forecasts.map((forecast) => [forecast.tankId, forecast]),
    );

    return tanks.map((tank) => {
      const reading = tank.sensor_uuid
        ? readingsBySensor.get(tank.sensor_uuid)
        : undefined;
      const readingTimestamp = this.isoTimestamp(reading?.timestamp);
      const heartbeatTimestamp = this.isoTimestamp(tank.lastTransmissionAt);
      const forecast = forecastsByTank.get(tank.id);

      return {
        tankId: tank.id,
        tankStatus: tank.status,
        sensorId: tank.sensor_uuid,
        sensorType: tank.sensor_uuid ? tank.sensor_type : null,
        level: this.finiteNumber(reading?.level),
        oilWaterInterface: this.oilWaterInterface(reading?.oilWaterInterface),
        readingTimestamp,
        readingFreshness: readingFreshness(readingTimestamp, asOf),
        heartbeat: {
          timestamp: heartbeatTimestamp,
          ...heartbeatFreshness(heartbeatTimestamp, asOf),
        },
        criticalAlarmOpen: criticalTankIds.has(tank.id),
        forecast:
          tank.status === TankStatus.ACTIVE &&
          forecast?.sensorId === tank.sensor_uuid &&
          forecast.lastReadingAt === readingTimestamp
            ? forecast
            : null,
        forecastError:
          forecastFailed &&
          tank.status === TankStatus.ACTIVE &&
          Boolean(tank.sensor_uuid),
      };
    });
  }

  private finiteNumber(value: unknown): number | null {
    return value != null && Number.isFinite(Number(value))
      ? Number(value)
      : null;
  }

  private isoTimestamp(value: Date | string | null | undefined): string | null {
    if (value == null || !Number.isFinite(new Date(value).getTime())) {
      return null;
    }
    return new Date(value).toISOString();
  }

  private oilWaterInterface(
    value: OilWaterInterface | null | undefined,
  ): OilWaterInterface | null {
    if (!value) return null;
    const oilLevel = this.finiteNumber(value.oilLevel);
    const waterLevel = this.finiteNumber(value.waterLevel);
    const interfaceLevel = this.finiteNumber(value.interfaceLevel);
    if (oilLevel === null || waterLevel === null || interfaceLevel === null) {
      return null;
    }
    return { oilLevel, waterLevel, interfaceLevel };
  }
}
