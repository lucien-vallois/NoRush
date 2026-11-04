import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  buildTankFigures,
  deadbandLiters,
  DEFAULT_DEADBAND_IN,
  GaugeSample,
  isValidDate,
  isValidTimeZone,
  lastCompletedDate,
  Layer,
  LayerFigures,
  makeVolumeFn,
  periodBounds,
  ReportPeriodKind,
  StrappingPoint,
} from './gauge-report.engine';

const KINDS: ReportPeriodKind[] = ['daily', 'day', 'night'];
/** readings kept on each side of the period, to pick the boundary gauges */
const MARGIN_MS = 30 * 60_000;

export interface GaugeReportQuery {
  period?: string;
  date?: string;
  startHour?: string | number;
  tz?: string;
}

export interface GaugeReportPoint {
  at: string;
  level: number;
  interfaceLevel: number | null;
  totalL: number;
  oilL: number | null;
  waterL: number | null;
}

export interface GaugeReportTank {
  tankId: string;
  code: string;
  name: string;
  status: string;
  /** public ID of the gauge used, null when the tank has none */
  gaugeId: string | null;
  highLevelThreshold: number | null;
  hasInterface: boolean;
  opening: GaugeReportPoint | null;
  closing: GaugeReportPoint | null;
  total: LayerFigures;
  oil: LayerFigures | null;
  water: LayerFigures | null;
  removals: { layer: Layer; start: string; end: string; amountL: number }[];
  maxLevel: number | null;
  samples: number;
  longestGapMinutes: number;
  alarms: { highLevel: number; overflowRisk: number; offline: number; total: number };
}

export interface GaugeReport {
  period: {
    kind: ReportPeriodKind;
    date: string;
    startHour: number;
    timeZone: string;
    start: string;
    end: string;
    hours: number;
  };
  generatedAt: string;
  deadbandInches: number;
  tanks: GaugeReportTank[];
  totals: {
    oilProducedL: number;
    waterProducedL: number;
    totalProducedL: number;
    oilRemovedL: number;
    waterRemovedL: number;
    totalRemovedL: number;
    oilClosingL: number;
    waterClosingL: number;
  };
}

interface TankRow {
  id: string;
  code: string;
  name: string;
  status: string;
  dimensions: { height?: number; diameter?: number } | null;
  arqueacaoTable: StrappingPoint[] | null;
  maxLevelThreshold: string | null;
  sensor_uuid: string | null;
  gauge_id: string | null;
}

/**
 * One continuous level gauge per tank, as in the forecasts: active first,
 * then the dual-float gauge, then the other continuous types. Point float
 * switches are left out. Inactive tanks are not reported.
 */
const TANKS_SQL = `
  SELECT * FROM (
    SELECT DISTINCT ON (t.id)
           t.id, t.code, t.name, t.status::text AS status, t.dimensions, t."arqueacaoTable",
           t."maxLevelThreshold", s.id AS sensor_uuid, s."sensorId" AS gauge_id
    FROM tanks t
    LEFT JOIN sensors s ON s."tankId" = t.id AND s.type::text <> 'float_switch'
    WHERE t.status::text <> 'inactive'
    ORDER BY t.id,
             (s.status::text = 'active') DESC NULLS LAST,
             CASE s.type::text
               WHEN 'magnetostrictive' THEN 0
               WHEN 'radar_level' THEN 1
               WHEN 'ultrasonic' THEN 2
               WHEN 'pressure' THEN 3
               WHEN 'capacitive' THEN 4
               ELSE 9 END,
             s."sensorId"
  ) picked
  ORDER BY code`;

const READINGS_SQL = `
  SELECT "sensorId" AS sensor_uuid,
         (EXTRACT(EPOCH FROM "timestamp") * 1000)::float8 AS t,
         level::float8 AS level,
         ("oilWaterInterface"->>'interfaceLevel')::float8 AS interface_level
  FROM readings
  WHERE "sensorId" = ANY($1::uuid[]) AND "timestamp" >= $2 AND "timestamp" <= $3
  ORDER BY "sensorId", "timestamp"`;

const ALARMS_SQL = `
  SELECT "tankId" AS tank_id, type::text AS type, COUNT(*)::int AS n
  FROM alerts
  WHERE "createdAt" >= $1 AND "createdAt" < $2
  GROUP BY 1, 2`;

@Injectable()
export class GaugeReportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** Validate the query and fill in the defaults (last completed period, configured start hour and time zone). */
  resolve(query: GaugeReportQuery, now = Date.now()) {
    const kind = (query.period ?? 'daily') as ReportPeriodKind;
    if (!KINDS.includes(kind)) throw new BadRequestException({ code: 'invalidReportPeriod' });

    const rawHour = query.startHour ?? this.config.get('GAUGE_DAY_START_HOUR', '7');
    const startHour = Number(rawHour);
    if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
      throw new BadRequestException({ code: 'invalidStartHour' });
    }

    const timeZone = query.tz || this.config.get<string>('GAUGE_DAY_TIMEZONE', 'UTC');
    if (!isValidTimeZone(timeZone)) throw new BadRequestException({ code: 'invalidTimeZone', tz: timeZone });

    const date = query.date || lastCompletedDate(kind, now, startHour, timeZone);
    if (!isValidDate(date)) throw new BadRequestException({ code: 'invalidReportDate' });

    return { kind, date, startHour, timeZone };
  }

  async build(query: GaugeReportQuery): Promise<GaugeReport> {
    const { kind, date, startHour, timeZone } = this.resolve(query);
    const period = periodBounds(kind, date, startHour, timeZone);

    const tanks: TankRow[] = await this.dataSource.query(TANKS_SQL);
    const sensorIds = tanks.map((t) => t.sensor_uuid).filter((id): id is string => !!id);

    const readings: { sensor_uuid: string; t: number; level: number; interface_level: number | null }[] =
      sensorIds.length
        ? await this.dataSource.query(READINGS_SQL, [
            sensorIds,
            new Date(period.start - MARGIN_MS),
            new Date(period.end + MARGIN_MS),
          ])
        : [];
    const bySensor = new Map<string, GaugeSample[]>();
    for (const r of readings) {
      const list = bySensor.get(r.sensor_uuid) ?? [];
      list.push({
        t: Number(r.t),
        level: Number(r.level),
        interfaceLevel: r.interface_level == null ? null : Number(r.interface_level),
      });
      bySensor.set(r.sensor_uuid, list);
    }

    const alarmRows: { tank_id: string; type: string; n: number }[] = await this.dataSource.query(ALARMS_SQL, [
      new Date(period.start),
      new Date(period.end),
    ]);

    const iso = (ms: number) => new Date(ms).toISOString();
    const reportTanks: GaugeReportTank[] = tanks.map((tank) => {
      const volume = makeVolumeFn(tank.dimensions, tank.arqueacaoTable);
      const deadband = deadbandLiters(volume, Number(tank.dimensions?.height ?? 0));
      const f = buildTankFigures(
        tank.sensor_uuid ? (bySensor.get(tank.sensor_uuid) ?? []) : [],
        period,
        volume,
        deadband,
      );
      const count = (type: string) =>
        alarmRows.filter((a) => a.tank_id === tank.id && a.type === type).reduce((acc, a) => acc + a.n, 0);
      const point = (p: typeof f.opening): GaugeReportPoint | null => (p ? { ...p, at: iso(p.at) } : null);
      return {
        tankId: tank.id,
        code: tank.code,
        name: tank.name,
        status: tank.status,
        gaugeId: tank.gauge_id,
        highLevelThreshold: tank.maxLevelThreshold == null ? null : Number(tank.maxLevelThreshold),
        hasInterface: f.hasInterface,
        opening: point(f.opening),
        closing: point(f.closing),
        total: f.total,
        oil: f.oil,
        water: f.water,
        removals: f.removals.map((e) => ({ layer: e.layer, start: iso(e.start), end: iso(e.end), amountL: e.amountL })),
        maxLevel: f.maxLevel,
        samples: f.samples,
        longestGapMinutes: f.longestGapMinutes,
        alarms: {
          highLevel: count('high_level'),
          overflowRisk: count('overflow_risk'),
          offline: count('sensor_offline'),
          total: alarmRows.filter((a) => a.tank_id === tank.id).reduce((acc, a) => acc + a.n, 0),
        },
      };
    });

    const sum = (pick: (t: GaugeReportTank) => number | null | undefined) =>
      reportTanks.reduce((acc, t) => acc + (pick(t) ?? 0), 0);

    return {
      period: {
        kind,
        date,
        startHour,
        timeZone,
        start: iso(period.start),
        end: iso(period.end),
        hours: Math.round((period.end - period.start) / 3_600_000),
      },
      generatedAt: new Date().toISOString(),
      deadbandInches: DEFAULT_DEADBAND_IN,
      tanks: reportTanks,
      totals: {
        oilProducedL: sum((t) => t.oil?.produced),
        waterProducedL: sum((t) => t.water?.produced),
        totalProducedL: sum((t) => t.total.produced),
        oilRemovedL: sum((t) => t.oil?.removed),
        waterRemovedL: sum((t) => t.water?.removed),
        totalRemovedL: sum((t) => t.total.removed),
        oilClosingL: sum((t) => t.oil?.closing),
        waterClosingL: sum((t) => t.water?.closing),
      },
    };
  }
}
