import { NotFoundException } from '@nestjs/common';
import { TankStatus } from '../../entities/tank.entity';
import { TankForecast } from '../predictions/predictions.service';
import { TankOperationalStateService } from './tank-operational-state.service';

describe('TankOperationalStateService', () => {
  const now = new Date('2026-11-01T12:00:00.000Z');
  const ago = (seconds: number) =>
    new Date(now.getTime() - seconds * 1000).toISOString();
  const selectedTank = {
    id: 'tank-1',
    code: 'TK-01',
    status: TankStatus.ACTIVE,
    sensor_uuid: 'sensor-1',
    sensor_type: 'magnetostrictive',
    lastTransmissionAt: ago(30),
  };
  const reading = {
    sensorId: 'sensor-1',
    level: '1.250',
    oilWaterInterface: {
      oilLevel: '1.000',
      waterLevel: '0.250',
      interfaceLevel: '0.250',
    },
    timestamp: ago(60),
  };
  const forecast = {
    tankId: 'tank-1',
    sensorId: 'sensor-1',
    currentLevel: 1.25,
    lastReadingAt: ago(60),
    dataFresh: true,
    predictedAt: now.toISOString(),
  } as TankForecast;

  let tanks: any[];
  let readings: any[];
  let alarms: { tankId: string }[];
  let source: { query: jest.Mock };
  let predictions: {
    computeAllForecasts: jest.Mock;
    computeForecastForTank: jest.Mock;
  };
  let service: TankOperationalStateService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    tanks = [{ ...selectedTank }];
    readings = [{ ...reading }];
    alarms = [];
    predictions = {
      computeAllForecasts: jest.fn(async () => [forecast]),
      computeForecastForTank: jest.fn(async () => forecast),
    };
    source = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM tanks t')) return tanks;
        if (sql.includes('FROM readings')) return readings;
        if (sql.includes('FROM alerts')) return alarms;
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    service = new TankOperationalStateService(
      source as never,
      predictions as never,
    );
  });

  afterEach(() => jest.useRealTimers());

  it('uses the selected level sensor for the reading, interface and forecast', async () => {
    const result = await service.findAllStates();

    expect(result.generatedAt).toBe(now.toISOString());
    expect(result.tanks).toHaveLength(1);
    expect(result.tanks[0]).toMatchObject({
      tankId: 'tank-1',
      tankStatus: 'active',
      sensorId: 'sensor-1',
      sensorType: 'magnetostrictive',
      level: 1.25,
      oilWaterInterface: {
        oilLevel: 1,
        waterLevel: 0.25,
        interfaceLevel: 0.25,
      },
      readingTimestamp: ago(60),
      readingFreshness: { fresh: true, ageSeconds: 60, maxAgeSeconds: 900 },
      heartbeat: {
        timestamp: ago(30),
        fresh: true,
        ageSeconds: 30,
        maxAgeSeconds: 300,
      },
      criticalAlarmOpen: false,
      forecast: { sensorId: 'sensor-1', currentLevel: 1.25 },
    });
    const readingCall = source.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM readings'),
    );
    expect(readingCall?.[1]).toEqual([['sensor-1'], now]);
    expect(String(readingCall?.[0])).toContain('DISTINCT ON ("sensorId")');
    expect(String(readingCall?.[0])).toContain('"timestamp" <= $2');
  });

  it('keeps stale level and interface visible while heartbeat remains fresh', async () => {
    readings = [{ ...reading, timestamp: ago(901) }];

    const [state] = (await service.findAllStates()).tanks;

    expect(state.level).toBe(1.25);
    expect(state.oilWaterInterface).toEqual({
      oilLevel: 1,
      waterLevel: 0.25,
      interfaceLevel: 0.25,
    });
    expect(state.readingFreshness).toEqual({
      fresh: false,
      ageSeconds: 901,
      maxAgeSeconds: 900,
    });
    expect(state.heartbeat.fresh).toBe(true);
  });

  it('does not infer a fresh heartbeat from a fresh reading', async () => {
    tanks = [{ ...selectedTank, lastTransmissionAt: ago(301) }];

    const [state] = (await service.findAllStates()).tanks;

    expect(state.readingFreshness.fresh).toBe(true);
    expect(state.heartbeat).toMatchObject({ fresh: false, ageSeconds: 301 });
  });

  it('preserves tanks without a level sensor and sensors without readings', async () => {
    tanks = [
      { ...selectedTank },
      {
        ...selectedTank,
        id: 'tank-2',
        code: 'TK-02',
        sensor_uuid: null,
        sensor_type: null,
        lastTransmissionAt: null,
      },
    ];
    readings = [];
    predictions.computeAllForecasts.mockResolvedValue([]);

    const result = await service.findAllStates();

    expect(result.tanks).toHaveLength(2);
    expect(result.tanks[0]).toMatchObject({
      sensorId: 'sensor-1',
      level: null,
      readingTimestamp: null,
      readingFreshness: { fresh: false, ageSeconds: null },
      forecast: null,
    });
    expect(result.tanks[1]).toMatchObject({
      tankId: 'tank-2',
      sensorId: null,
      sensorType: null,
      level: null,
      oilWaterInterface: null,
      heartbeat: { timestamp: null, fresh: false, ageSeconds: null },
      forecast: null,
    });
    const readingCall = source.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM readings'),
    );
    expect(readingCall?.[1][0]).toEqual(['sensor-1']);
  });

  it('keeps telemetry visible for maintenance but suspends its forecast', async () => {
    tanks = [{ ...selectedTank, status: TankStatus.MAINTENANCE }];

    const [state] = (await service.findAllStates()).tanks;

    expect(state).toMatchObject({
      tankStatus: 'maintenance',
      level: 1.25,
      readingTimestamp: ago(60),
      forecast: null,
    });
  });

  it('reports critical active or acknowledged alarms from the fleet query', async () => {
    tanks = [
      { ...selectedTank },
      { ...selectedTank, id: 'tank-2', code: 'TK-02', sensor_uuid: null },
    ];
    alarms = [{ tankId: 'tank-2' }];

    const result = await service.findAllStates();

    expect(result.tanks.map((tank) => tank.criticalAlarmOpen)).toEqual([
      false,
      true,
    ]);
    const alarmCall = source.query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM alerts'),
    );
    expect(String(alarmCall?.[0])).toContain(
      "status IN ('active', 'acknowledged')",
    );
    expect(alarmCall?.[1]).toEqual([['tank-1', 'tank-2']]);
  });

  it('propagates alarm query failures instead of silently reporting false', async () => {
    source.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM tanks t')) return tanks;
      if (sql.includes('FROM readings')) return readings;
      throw new Error('alerts unavailable');
    });

    await expect(service.findAllStates()).rejects.toThrow('alerts unavailable');
  });

  it('ignores a forecast that does not belong to the selected sensor', async () => {
    predictions.computeAllForecasts.mockResolvedValue([
      { ...forecast, sensorId: 'secondary-sensor' },
    ]);

    const [state] = (await service.findAllStates()).tanks;

    expect(state.sensorId).toBe('sensor-1');
    expect(state.forecast).toBeNull();
  });

  it('preserves fleet telemetry and alarms when forecast calculation rejects', async () => {
    tanks = [
      { ...selectedTank },
      {
        ...selectedTank,
        id: 'tank-2',
        code: 'TK-02',
        sensor_uuid: null,
        sensor_type: null,
      },
      {
        ...selectedTank,
        id: 'tank-3',
        code: 'TK-03',
        status: TankStatus.MAINTENANCE,
      },
    ];
    alarms = [{ tankId: 'tank-1' }];
    predictions.computeAllForecasts.mockRejectedValue(
      new Error('forecast unavailable'),
    );

    const result = await service.findAllStates();

    expect(result.generatedAt).toBe(now.toISOString());
    expect(result.tanks[0]).toMatchObject({
      tankId: 'tank-1',
      level: 1.25,
      oilWaterInterface: {
        oilLevel: 1,
        waterLevel: 0.25,
        interfaceLevel: 0.25,
      },
      readingTimestamp: ago(60),
      readingFreshness: { fresh: true, ageSeconds: 60 },
      heartbeat: { timestamp: ago(30), fresh: true, ageSeconds: 30 },
      criticalAlarmOpen: true,
      forecast: null,
      forecastError: true,
    });
    expect(result.tanks.map((tank) => tank.forecastError)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it('preserves individual telemetry and alarms when forecast calculation rejects', async () => {
    alarms = [{ tankId: 'tank-1' }];
    predictions.computeForecastForTank.mockRejectedValue(
      new Error('forecast unavailable'),
    );

    const state = await service.findStateByTank('tank-1');

    expect(state).toMatchObject({
      tankId: 'tank-1',
      sensorId: 'sensor-1',
      level: 1.25,
      oilWaterInterface: {
        oilLevel: 1,
        waterLevel: 0.25,
        interfaceLevel: 0.25,
      },
      readingTimestamp: ago(60),
      readingFreshness: { fresh: true, ageSeconds: 60 },
      heartbeat: { timestamp: ago(30), fresh: true, ageSeconds: 30 },
      criticalAlarmOpen: true,
      forecast: null,
      forecastError: true,
    });
  });

  it('drops a forecast whose reading is outside the response temporal snapshot', async () => {
    predictions.computeAllForecasts.mockResolvedValue([
      { ...forecast, lastReadingAt: ago(59) },
    ]);

    const [state] = (await service.findAllStates()).tanks;

    expect(state.readingTimestamp).toBe(ago(60));
    expect(state.forecast).toBeNull();
    expect(state.forecastError).toBe(false);
  });

  it('accepts matching null reading timestamps when neither side has telemetry', async () => {
    readings = [];
    predictions.computeAllForecasts.mockResolvedValue([
      {
        ...forecast,
        currentLevel: null,
        lastReadingAt: null,
        dataFresh: false,
      },
    ]);

    const [state] = (await service.findAllStates()).tanks;

    expect(state.readingTimestamp).toBeNull();
    expect(state.forecast).toMatchObject({ lastReadingAt: null });
    expect(state.forecastError).toBe(false);
  });

  it('returns 404 for an unknown tank without calculating a forecast', async () => {
    tanks = [];

    await expect(service.findStateByTank('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(predictions.computeForecastForTank).not.toHaveBeenCalled();
  });
});
