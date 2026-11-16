import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity, AlertType } from '../../entities/alert.entity';
import { WsEmitterService } from '../websocket/ws-emitter.service';

export interface TankForecast {
  tankId: string;
  tankCode: string;
  tankName: string;
  sensorId: string; // UUID do sensor de nível usado na regressão
  currentLevel: number | null;
  lastReadingAt: string | null;
  dataFresh: boolean;
  fillRateMH: number | null; // m/h — negativo = esvaziando
  fillRateM3H: number | null;
  trend: 'rising' | 'falling' | 'stable' | 'unknown';
  confidence: number; // R² da regressão (0-1)
  regressionSource: 'raw' | 'aggregate'; // janela usada na regressão
  etaMaxLevelHours: number | null;
  etaOverflowHours: number | null;
  etaMinLevelHours: number | null;
  thresholds: {
    maxLevel: number | null;
    overflow: number | null;
    minLevel: number | null;
    lowLevel: number | null;
  };
  predictedAt: string;
}

const REGRESSION_POINTS = 24; // 24 × 5min = ~2h de histórico por bucket
const MIN_POINTS = 5;
const STABLE_BAND_MH = 0.005; // abaixo disso o ritmo é ruído
const MAX_ETA_HOURS = 72;
const PREDICTIVE_ALERT_WINDOW_H = 6; // alerta se ETA de transbordo <= 6h
const PREDICTIVE_ALERT_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Um sensor de nível contínuo por tanque. float_switch só indica um ponto e
 * fica de fora; com mais de um sensor no tanque, a haste de duas boias tem
 * prioridade. Comparação em texto para não depender de o enum do banco já
 * conhecer todos os valores.
 */
const LEVEL_SENSOR_PRIORITY = `CASE s.type::text
         WHEN 'magnetostrictive' THEN 0
         WHEN 'radar_level' THEN 1
         WHEN 'ultrasonic' THEN 2
         WHEN 'pressure' THEN 3
         WHEN 'capacitive' THEN 4
         ELSE 9 END`;

const tankLevelSensorSql = (where: string): string =>
  `SELECT * FROM (
     SELECT DISTINCT ON (t.id)
            t.id, t.code, t.name,
            t."maxLevelThreshold", t."overflowThreshold",
            t."minLevelThreshold", t."lowLevelThreshold",
            (t.dimensions->>'diameter')::numeric AS diameter,
            s.id AS sensor_uuid
     FROM tanks t
     JOIN sensors s ON s."tankId" = t.id
                   AND s.type::text <> 'float_switch'
                   AND s.status = 'active'
     WHERE ${where}
     ORDER BY t.id, ${LEVEL_SENSOR_PRIORITY}, s."sensorId"
   ) picked
   ORDER BY code`;

/**
 * Motor de previsão: regressão linear (mínimos quadrados) do nível sobre os
 * agregados contínuos de 5min do TimescaleDB → ritmo de enchimento (m/h) e
 * ETA até os limites do tanque. Roda sob demanda (endpoint) e a cada 5min
 * (cron), disparando alertas preditivos e broadcast WebSocket 'forecast'.
 */
@Injectable()
export class PredictionsService {
  private readonly logger = new Logger(PredictionsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly alertsService: AlertsService,
    private readonly wsEmitter: WsEmitterService,
  ) {}

  async computeAllForecasts(): Promise<TankForecast[]> {
    const tanks = await this.dataSource.query(
      tankLevelSensorSql(`t.status = 'active'`),
    );

    const forecasts: TankForecast[] = [];
    for (const tank of tanks) {
      const forecast = await this.computeForecastForSensor(tank);
      if (forecast) forecasts.push(forecast);
    }
    return forecasts;
  }

  async computeForecastForTank(tankId: string): Promise<TankForecast | null> {
    const rows = await this.dataSource.query(
      tankLevelSensorSql(`t.id = $1 AND t.status = 'active'`),
      [tankId],
    );
    if (!rows?.length) return null;
    return this.computeForecastForSensor(rows[0]);
  }

  private async computeForecastForSensor(
    tank: any,
  ): Promise<TankForecast | null> {
    // Janela adaptativa: telemetria densa (ex.: 1 msg/2s) → regressão sobre as
    // leituras crus mais recentes (reage em segundos); telemetria esparsa
    // (1 msg/5min) → cai para os agregados de 5min do Timescale (menos ruído).
    let points: { x: number; y: number }[] = [];
    let regressionSource: 'raw' | 'aggregate' = 'raw';

    const raw = await this.dataSource.query(
      `SELECT EXTRACT(EPOCH FROM "timestamp") AS x, level AS y
       FROM readings
       WHERE "sensorId" = $1 AND "timestamp" >= now() - INTERVAL '15 minutes'
         AND "timestamp" <= now()
       ORDER BY "timestamp" DESC
       LIMIT 120`,
      [tank.sensor_uuid],
    );
    const rawIsFresh =
      raw?.length >= MIN_POINTS && Date.now() / 1000 - Number(raw[0].x) <= 600; // dado mais novo < 10min

    if (rawIsFresh) {
      points = raw
        .map((r: any) => ({ x: Number(r.x), y: Number(r.y) }))
        .reverse(); // DESC no SQL → cronológico para a regressão
    } else {
      const series = await this.dataSource.query(
        `SELECT bucket, avg_level FROM readings_5m
         WHERE "sensorId" = $1 AND avg_level IS NOT NULL
           AND bucket >= now() - INTERVAL '2 hours' AND bucket <= now()
         ORDER BY bucket DESC LIMIT ${REGRESSION_POINTS}`,
        [tank.sensor_uuid],
      );
      points = (series ?? []).reverse().map((r: any) => ({
        x: new Date(r.bucket).getTime() / 1000,
        y: Number(r.avg_level),
      }));
      regressionSource = 'aggregate';
    }

    // Última leitura cru = nível atual
    const latest = await this.dataSource.query(
      `SELECT level, "timestamp" FROM readings WHERE "sensorId" = $1 AND "timestamp" <= now()
       ORDER BY "timestamp" DESC LIMIT 1`,
      [tank.sensor_uuid],
    );
    const lastReadingAt = latest?.[0]?.timestamp
      ? new Date(latest[0].timestamp).toISOString()
      : null;
    const ageMs = lastReadingAt
      ? Date.now() - new Date(lastReadingAt).getTime()
      : Infinity;
    const dataFresh =
      ageMs >= 0 &&
      ageMs <= 15 * 60 * 1000 &&
      latest?.[0]?.level != null &&
      Number.isFinite(Number(latest[0].level));
    const currentLevel =
      dataFresh && latest?.[0]?.level != null ? Number(latest[0].level) : null;
    points = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

    const reg =
      dataFresh && points.length >= MIN_POINTS
        ? this.linearRegression(points)
        : null;
    const fillRateMH = reg ? reg.slope * 3600 : null;
    const n = points.length;

    let trend: TankForecast['trend'] = 'unknown';
    if (reg && n >= MIN_POINTS) {
      if (fillRateMH! > STABLE_BAND_MH) trend = 'rising';
      else if (fillRateMH! < -STABLE_BAND_MH) trend = 'falling';
      else trend = 'stable';
    }

    const diameter = tank.diameter ? Number(tank.diameter) : null;
    const area = diameter ? Math.PI * (diameter / 2) ** 2 : null;

    const eta = (
      threshold: number | null,
      direction: 'up' | 'down',
    ): number | null => {
      if (!reg || threshold === null || threshold === undefined) return null;
      if (currentLevel === null) return null;
      if (reg.r2 < 0.5) return null;
      if (direction === 'up' && currentLevel >= threshold) return 0;
      if (direction === 'down' && currentLevel <= threshold) return 0;
      const rate = fillRateMH!;
      if (direction === 'up' ? rate <= STABLE_BAND_MH : rate >= -STABLE_BAND_MH)
        return null;
      const hours = (threshold - currentLevel) / rate;
      if (!Number.isFinite(hours) || hours < 0 || hours > MAX_ETA_HOURS)
        return null;
      return hours === 0 ? 0 : Math.max(0.01, Math.round(hours * 100) / 100);
    };

    const num = (v: any): number | null =>
      v == null || !Number.isFinite(Number(v)) ? null : Number(v);

    return {
      tankId: tank.id,
      tankCode: tank.code,
      tankName: tank.name,
      sensorId: tank.sensor_uuid,
      currentLevel,
      lastReadingAt,
      dataFresh,
      fillRateMH:
        fillRateMH !== null ? Math.round(fillRateMH * 1000) / 1000 : null,
      fillRateM3H:
        fillRateMH !== null && area
          ? Math.round(fillRateMH * area * 10) / 10
          : null,
      trend,
      confidence: reg ? Math.round(reg.r2 * 100) / 100 : 0,
      regressionSource,
      etaMaxLevelHours: eta(num(tank.maxLevelThreshold), 'up'),
      etaOverflowHours: eta(num(tank.overflowThreshold), 'up'),
      etaMinLevelHours: eta(num(tank.minLevelThreshold), 'down'),
      thresholds: {
        maxLevel: num(tank.maxLevelThreshold),
        overflow: num(tank.overflowThreshold),
        minLevel: num(tank.minLevelThreshold),
        lowLevel: num(tank.lowLevelThreshold),
      },
      predictedAt: new Date().toISOString(),
    };
  }

  /** Regressão linear simples com R². Retorna null se degenerada. */
  private linearRegression(
    points: { x: number; y: number }[],
  ): { slope: number; intercept: number; r2: number } | null {
    const n = points.length;
    if (n < 2) return null;

    const meanX = points.reduce((a, p) => a + p.x, 0) / n;
    const meanY = points.reduce((a, p) => a + p.y, 0) / n;

    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (const p of points) {
      sxy += (p.x - meanX) * (p.y - meanY);
      sxx += (p.x - meanX) ** 2;
      syy += (p.y - meanY) ** 2;
    }
    if (sxx === 0) return null;
    if (syy === 0) return { slope: 0, intercept: meanY, r2: 1 };

    const slope = sxy / sxx;
    const intercept = meanY - slope * meanX;
    const r2 = (sxy * sxy) / (sxx * syy);

    return { slope, intercept, r2 };
  }

  /** Cron: recalcula previsões, dispara alertas preditivos e emite 'forecast'. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async runPredictionCycle(): Promise<void> {
    try {
      const forecasts = await this.computeAllForecasts();

      for (const f of forecasts) {
        if (
          f.etaOverflowHours !== null &&
          f.etaOverflowHours <= PREDICTIVE_ALERT_WINDOW_H &&
          f.confidence >= 0.5
        ) {
          await this.maybeCreatePredictiveAlert(f);
        }
      }

      this.wsEmitter.emit('forecast', {
        predictedAt: new Date().toISOString(),
        forecasts,
      });
      this.logger.debug(
        `Ciclo de previsão: ${forecasts.length} tanques avaliados`,
      );
    } catch (error) {
      this.logger.error('Falha no ciclo de previsão:', error);
    }
  }

  private async maybeCreatePredictiveAlert(f: TankForecast): Promise<void> {
    const severity =
      f.etaOverflowHours! <= 2 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH;
    const eta = this.formatHours(f.etaOverflowHours!);

    try {
      const startedAt = Date.now();
      const alert = await this.alertsService.createAutomaticAlert(
        AlertType.OVERFLOW_RISK,
        severity,
        f.tankId,
        f.sensorId,
        f.currentLevel ?? undefined,
        undefined,
        f.thresholds.overflow ?? undefined,
        {
          predictive: true,
          etaHours: f.etaOverflowHours,
          fillRateMH: f.fillRateMH,
          confidence: f.confidence,
        },
        PREDICTIVE_ALERT_COOLDOWN_MS,
      );
      const createdAt = alert.createdAt
        ? new Date(alert.createdAt).getTime()
        : startedAt;
      if (createdAt < startedAt) return;

      // Payload estruturado para clientes comporem no idioma do usuário
      this.wsEmitter.emitAlert({
        sensorId: f.sensorId,
        tankId: f.tankId,
        type: AlertType.OVERFLOW_RISK,
        reason: `Forecast: overflow in ${eta} (tank ${f.tankCode})`,
        level: f.currentLevel ?? undefined,
        threshold: f.thresholds.overflow
          ? Number(f.thresholds.overflow)
          : undefined,
        timestamp: new Date().toISOString(),
        metadata: {
          predictive: true,
          tankCode: f.tankCode,
          etaHours: f.etaOverflowHours,
          fillRateMH: f.fillRateMH,
          confidence: f.confidence,
        },
      });
      this.logger.log(
        `Alerta preditivo criado p/ ${f.tankCode} (ETA ${eta}): ${alert.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Falha ao criar alerta preditivo p/ ${f.tankCode}:`,
        error,
      );
    }
  }

  private formatHours(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }
}
