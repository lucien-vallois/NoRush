import { ConfigService } from '@nestjs/config';
import { MessageProcessorService } from './message-processor.service';
import { DeviceCredentialsService } from '../devices/device-credentials.service';
import { createHash } from 'crypto';

describe('Telemetry ingestion boundaries', () => {
  const sensors = { findOne: jest.fn(), update: jest.fn() };
  const readings = {
    find: jest.fn(),
    create: jest.fn((value: unknown) => value),
    insert: jest.fn(),
  };
  const queue = {
    emit: jest.fn((_pattern: string, _payload: any) => ({ subscribe: jest.fn() })),
  };
  const emitter = {
    emitReading: jest.fn(),
    emitAlert: jest.fn(),
    emit: jest.fn(),
  };
  const alertProcessor = { processReadingForAlerts: jest.fn() };
  let service: MessageProcessorService;
  let sensor: any;

  const makeRepo = () => ({
    findOne: sensors.findOne,
    update: sensors.update,
    createQueryBuilder: () => ({
      addSelect: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(sensor),
    }),
  });

  const buildService = (env?: Record<string, string>) => {
    const config = new ConfigService(env);
    return new MessageProcessorService(
      makeRepo() as never,
      readings as never,
      {} as never,
      queue as never,
      config,
      {} as never,
      alertProcessor as never,
      emitter as never,
      new DeviceCredentialsService(config),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sensor = {
      id: 'sensor-1',
      sensorId: 'SENSOR-001',
      status: 'active',
      transmissionCount: 0,
      credentialVersion: 0,
      credentialHash: null,
      measurementRangeMin: 0,
      measurementRangeMax: 5,
      tankId: 'tank-1',
      tank: {
        dimensions: { height: 5 },
        getVolumeFromLevel: (level: number) => level * 1000,
      },
    };
    sensors.findOne.mockImplementation(async () => sensor);
    readings.find.mockResolvedValue([]);
    service = buildService();
  });

  const assertNoSideEffects = () => {
    expect(readings.insert).not.toHaveBeenCalled();
    expect(sensors.update).not.toHaveBeenCalled();
    expect(queue.emit).not.toHaveBeenCalled();
    expect(emitter.emitReading).not.toHaveBeenCalled();
  };

  it.each([-1, NaN, Infinity, '1.5', undefined])(
    'rejects invalid levels without writing or broadcasting: %s',
    async (level) => {
      expect(
        (
          await service.processSensorMessage({
            sensorId: 'SENSOR-001',
            level,
          } as any)
        ).isValid,
      ).toBe(false);
      assertNoSideEffects();
    },
  );
  it('rejects an inactive sensor before persistence', async () => {
    sensor.status = 'maintenance';
    expect(
      (await service.processSensorMessage({ sensorId: 'SENSOR-001', level: 1 }))
        .isValid,
    ).toBe(false);
    assertNoSideEffects();
  });
  it('rejects values outside sensor range and tank height', async () => {
    expect(
      (await service.processSensorMessage({ sensorId: 'SENSOR-001', level: 6 }))
        .isValid,
    ).toBe(false);
    assertNoSideEffects();
  });
  it('rejects inconsistent interfaces and invalid future timestamps', async () => {
    expect(
      (
        await service.processSensorMessage({
          sensorId: 'SENSOR-001',
          level: 1,
          oilWaterInterface: {
            oilLevel: 0.6,
            waterLevel: 0.8,
            interfaceLevel: 0.9,
          },
        })
      ).isValid,
    ).toBe(false);
    expect(
      (
        await service.processSensorMessage({
          sensorId: 'SENSOR-001',
          level: 1,
          timestamp: new Date(Date.now() + 60000).toISOString(),
        })
      ).isValid,
    ).toBe(false);
    assertNoSideEffects();
  });
  it('accepts a water-majority tank (interface above the oil layer thickness)', async () => {
    const result = await service.processSensorMessage({
      sensorId: 'SENSOR-001',
      level: 4,
      oilWaterInterface: {
        oilLevel: 1,
        waterLevel: 3,
        interfaceLevel: 3,
      },
    });
    expect(result.isValid).toBe(true);
    expect(result.validationErrors).toEqual([]);
  });
  it('rejects an interface above the total level', async () => {
    expect(
      (
        await service.processSensorMessage({
          sensorId: 'SENSOR-001',
          level: 1,
          oilWaterInterface: {
            oilLevel: 0.4,
            waterLevel: 0.6,
            interfaceLevel: 1.2,
          },
        })
      ).isValid,
    ).toBe(false);
    assertNoSideEffects();
  });
  it('accepts a consistent decimal interface at millimetre precision', async () => {
    const result = await service.processSensorMessage({
      sensorId: 'SENSOR-001',
      level: 0.3,
      oilWaterInterface: {
        oilLevel: 0.2,
        waterLevel: 0.1,
        interfaceLevel: 0.15,
      },
    });
    expect(result.isValid).toBe(true);
    expect(readings.insert).toHaveBeenCalledTimes(1);
    expect(result.reading).toMatchObject({
      level: 0.3,
      volume: 300,
      isCalibrated: false,
    });
    expect(emitter.emitReading).toHaveBeenCalledTimes(1);
  });
  it('requires the configured key on all processing paths and removes it from queued payloads', async () => {
    service = buildService({ IOT_INGEST_KEY: 'test-ingest-key' });
    const results = await service.processBatchMessages([
      { sensorId: 'SENSOR-001', level: 1, authToken: 'wrong' },
      { sensorId: 'SENSOR-001', level: 1 },
    ]);
    expect(results.every((result) => !result.isValid)).toBe(true);
    assertNoSideEffects();
    expect(
      (
        await service.processSensorMessage({
          sensorId: 'SENSOR-001',
          level: 1,
          authToken: 'test-ingest-key',
        })
      ).isValid,
    ).toBe(true);
    expect(queue.emit.mock.calls[0][1].originalMessage).not.toHaveProperty(
      'authToken',
    );
  });
  it('fails closed in production when no ingestion key is configured', async () => {
    // jest exporta NODE_ENV=test, o que sobrepõe a config interna do
    // ConfigService; aqui precisamos de um ambiente de fato "production".
    const productionConfig = {
      get: (key: string) => (key === 'NODE_ENV' ? 'production' : undefined),
    } as never;
    service = new MessageProcessorService(
      makeRepo() as never,
      readings as never,
      {} as never,
      queue as never,
      productionConfig,
      {} as never,
      alertProcessor as never,
      emitter as never,
      new DeviceCredentialsService(productionConfig),
    );
    expect(
      (
        await service.processSensorMessage({
          sensorId: 'SENSOR-001',
          level: 1,
          authToken: 'any-token',
        })
      ).isValid,
    ).toBe(false);
    assertNoSideEffects();
  });

  describe('per-device credentials', () => {
    const provisionSensor = (secret: string) => {
      sensor.credentialHash = createHash('sha256').update(secret).digest('hex');
      sensor.credentialVersion = 1;
    };

    it('rejects any token in device mode when the device is not provisioned', async () => {
      service = buildService({ IOT_AUTH_MODE: 'device' });
      const result = await service.processSensorMessage({
        sensorId: 'SENSOR-001',
        level: 1,
        authToken: 'whatever',
      });
      expect(result.isValid).toBe(false);
      expect(result.validationErrors[0]).toContain('deviceNotProvisioned');
      assertNoSideEffects();
    });

    it('accepts a valid per-device credential and rejects a wrong one', async () => {
      service = buildService({ IOT_AUTH_MODE: 'device' });
      provisionSensor('nrk_device_secret');
      expect(
        (
          await service.processSensorMessage({
            sensorId: 'SENSOR-001',
            level: 1,
            authToken: 'nrk_wrong_secret',
          })
        ).isValid,
      ).toBe(false);
      assertNoSideEffects();
      expect(
        (
          await service.processSensorMessage({
            sensorId: 'SENSOR-001',
            level: 1,
            authToken: 'nrk_device_secret',
          })
        ).isValid,
      ).toBe(true);
    });

    it('device mode does not fall back to the shared key', async () => {
      service = buildService({
        IOT_AUTH_MODE: 'device',
        IOT_INGEST_KEY: 'shared-key',
      });
      provisionSensor('nrk_device_secret');
      const result = await service.processSensorMessage({
        sensorId: 'SENSOR-001',
        level: 1,
        authToken: 'shared-key',
      });
      expect(result.isValid).toBe(false);
      assertNoSideEffects();
    });

    it('hybrid mode accepts either the device credential or the shared key', async () => {
      service = buildService({
        IOT_AUTH_MODE: 'hybrid',
        IOT_INGEST_KEY: 'shared-key',
      });
      provisionSensor('nrk_device_secret');
      expect(
        (
          await service.processSensorMessage({
            sensorId: 'SENSOR-001',
            level: 1,
            authToken: 'shared-key',
          })
        ).isValid,
      ).toBe(true);
      expect(
        (
          await service.processSensorMessage({
            sensorId: 'SENSOR-001',
            level: 1,
            authToken: 'nrk_device_secret',
          })
        ).isValid,
      ).toBe(true);
    });

    it('revoked credential no longer authenticates', async () => {
      service = buildService({ IOT_AUTH_MODE: 'device' });
      provisionSensor('nrk_device_secret');
      sensor.credentialHash = null; // revogação limpa o hash
      const result = await service.processSensorMessage({
        sensorId: 'SENSOR-001',
        level: 1,
        authToken: 'nrk_device_secret',
      });
      expect(result.isValid).toBe(false);
      assertNoSideEffects();
    });
  });

  describe('heartbeat', () => {
    it('updates transmission state without creating a reading', async () => {
      sensor.credentialHash = createHash('sha256')
        .update('nrk_device_secret')
        .digest('hex');
      service = buildService({ IOT_AUTH_MODE: 'device' });
      const result = await service.processHeartbeat({
        sensorId: 'SENSOR-001',
        authToken: 'nrk_device_secret',
        batteryLevel: 77,
        firmwareVersion: '1.4.2',
      });
      expect(result.received).toBe(true);
      expect(sensors.update).toHaveBeenCalledWith('sensor-1', {
        lastTransmissionAt: expect.any(Date),
        batteryLevel: 77,
        batteryLastUpdate: expect.any(Date),
        firmwareVersion: '1.4.2',
      });
      expect(readings.insert).not.toHaveBeenCalled();
    });

    it('refuses heartbeat from an unauthenticated device', async () => {
      service = buildService({ IOT_AUTH_MODE: 'device' });
      const result = await service.processHeartbeat({
        sensorId: 'SENSOR-001',
        authToken: 'bogus',
      });
      expect(result.received).toBe(false);
      expect(sensors.update).not.toHaveBeenCalled();
    });
  });
});
