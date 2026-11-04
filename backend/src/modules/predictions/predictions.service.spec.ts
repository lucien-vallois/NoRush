import { PredictionsService } from './predictions.service';

describe('Operational forecasts', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  const tank = {
    id: 'tank-1',
    code: 'FK-01',
    name: 'Test tank',
    sensor_uuid: 'sensor-1',
    diameter: 3.2,
    maxLevelThreshold: 4.2,
    overflowThreshold: 4.6,
    minLevelThreshold: 0.3,
    lowLevelThreshold: 0.5,
  };
  let raw: { x: number; y: number }[];
  let aggregate: { bucket: string; avg_level: number }[];
  let latest: { level: number; timestamp: string }[];
  let service: PredictionsService;
  let source: { query: jest.Mock };
  const alerts = { create: jest.fn() };
  const emitter = { emit: jest.fn(), emitAlert: jest.fn() };
  const points = (levels: number[]) =>
    levels.map((y, i) => ({
      x: now.getTime() / 1000 - (levels.length - 1 - i) * 60,
      y,
    }));
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    raw = points([1, 1.1, 1.2, 1.3, 1.4]);
    aggregate = [];
    latest = [{ level: 1.4, timestamp: now.toISOString() }];
    jest.clearAllMocks();
    source = {
      query: jest.fn(async (sql: string) =>
        sql.includes('FROM tanks t')
          ? [tank]
          : sql.includes('SELECT level,')
            ? latest
            : sql.includes('FROM readings_5m')
              ? aggregate
              : raw,
      ),
    };
    service = new PredictionsService(
      source as never,
      alerts as never,
      emitter as never,
    );
  });
  afterEach(() => jest.useRealTimers());
  it('calculates rising level, volumetric rate, fit and overflow ETA with explicit units', async () => {
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      dataFresh: true,
      currentLevel: 1.4,
      fillRateMH: 6,
      fillRateM3H: 48.3,
      trend: 'rising',
      confidence: 1,
      etaOverflowHours: 0.53,
      etaMinLevelHours: null,
    });
  });
  it('suspends forecasts and predictive alerts for stale telemetry', async () => {
    raw = [];
    latest = [
      {
        level: 4.5,
        timestamp: new Date(now.getTime() - 16 * 60000).toISOString(),
      },
    ];
    const forecast = await service.computeForecastForTank(tank.id);
    expect(forecast).toMatchObject({
      dataFresh: false,
      currentLevel: null,
      fillRateMH: null,
      confidence: 0,
      trend: 'unknown',
      etaOverflowHours: null,
    });
    await service.runPredictionCycle();
    expect(alerts.create).not.toHaveBeenCalled();
  });
  it('returns an unknown state rather than fabricating an empty tank', async () => {
    raw = [];
    latest = [];
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      currentLevel: null,
      lastReadingAt: null,
      dataFresh: false,
      etaOverflowHours: null,
    });
  });
  it('does not estimate ETA from fewer than five samples', async () => {
    raw = points([1, 2]);
    aggregate = raw.map((p) => ({
      bucket: new Date(p.x * 1000).toISOString(),
      avg_level: p.y,
    }));
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      currentLevel: 1.4,
      fillRateMH: null,
      trend: 'unknown',
      etaOverflowHours: null,
    });
  });
  it('treats a constant level as stable without division by zero', async () => {
    raw = points([1.4, 1.4, 1.4, 1.4, 1.4]);
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      fillRateMH: 0,
      trend: 'stable',
      etaOverflowHours: null,
      confidence: 1,
    });
  });
  it('predicts the lower threshold only while draining', async () => {
    raw = points([1.8, 1.7, 1.6, 1.5, 1.4]);
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      trend: 'falling',
      fillRateMH: -6,
      etaOverflowHours: null,
      etaMinLevelHours: 0.18,
    });
  });
  it('represents an exceeded high threshold as immediate attention', async () => {
    raw = points([4.4, 4.5, 4.6, 4.7, 4.8]);
    latest[0].level = 4.8;
    expect(await service.computeForecastForTank(tank.id)).toMatchObject({
      etaOverflowHours: 0,
      etaMaxLevelHours: 0,
    });
  });
  it('does not present a precise ETA for a poor linear fit', async () => {
    raw = points([1, 4, 1, 4, 1.1]);
    expect(
      (await service.computeForecastForTank(tank.id))?.etaOverflowHours,
    ).toBeNull();
  });
  it('does not round a future crossing down to an already-crossed limit', async () => {
    raw = points([4.199, 4.299, 4.399, 4.499, 4.599]);
    latest[0].level = 4.599;
    expect(
      (await service.computeForecastForTank(tank.id))?.etaOverflowHours,
    ).toBe(0.01);
  });
  it('picks the tank level sensor by capability, not one hard-coded type', async () => {
    await service.computeAllForecasts();
    const sql = String(source.query.mock.calls[0][0]);
    expect(sql).toContain("'magnetostrictive'");
    expect(sql).toContain("<> 'float_switch'");
    expect(sql).toContain('DISTINCT ON (t.id)');
    expect(sql).not.toMatch(/s\.type\s*=\s*'ultrasonic'/);
  });
  it('rejects nonfinite samples instead of emitting NaN', async () => {
    raw = points([1, NaN, 1.2, Infinity, 1.4]);
    const result = await service.computeForecastForTank(tank.id);
    expect(result?.etaOverflowHours).toBeNull();
    expect(JSON.stringify(result)).not.toContain('NaN');
  });
});
