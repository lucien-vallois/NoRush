import { In, IsNull } from 'typeorm';
import {
  AlertSeverity,
  AlertStatus,
  AlertType,
} from '../../entities/alert.entity';
import { AlertsService } from './alerts.service';

describe('AlertsService.createAutomaticAlert', () => {
  const alerts = {
    findOne: jest.fn(),
    create: jest.fn((value: object) => value),
    save: jest.fn(async (value: object) => ({ id: 'new-alert', ...value })),
  };
  const tanks = {
    findOne: jest.fn(async () => ({ id: 'tank-1', name: 'FK-01' })),
  };
  const sensors = { findOne: jest.fn(async () => ({ id: 'sensor-1' })) };
  const manager = {
    query: jest.fn(),
    getRepository: jest.fn(
      (entity: { name: string }) =>
        ({ Alert: alerts, Tank: tanks, Sensor: sensors })[entity.name],
    ),
  };
  let transactionQueue = Promise.resolve();
  const dataSource = {
    transaction: jest.fn(async (work: (manager: unknown) => unknown) => {
      const previous = transactionQueue;
      let release: () => void;
      transactionQueue = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work(manager);
      } finally {
        release!();
      }
    }),
  };
  let service: AlertsService;

  beforeEach(() => {
    jest.clearAllMocks();
    transactionQueue = Promise.resolve();
    service = new AlertsService(
      alerts as never,
      tanks as never,
      sensors as never,
      {} as never,
      dataSource as never,
    );
  });

  const trip = () =>
    service.createAutomaticAlert(
      AlertType.HIGH_LEVEL,
      AlertSeverity.MEDIUM,
      'tank-1',
      'sensor-1',
      4.3,
      34000,
      4.2,
    );

  it('opens a new alert when no alert is open for the same condition', async () => {
    alerts.findOne.mockResolvedValueOnce(null);

    const created = await trip();

    expect(alerts.save).toHaveBeenCalledTimes(1);
    expect(created).toMatchObject({
      id: 'new-alert',
      type: AlertType.HIGH_LEVEL,
      status: AlertStatus.ACTIVE,
      thresholdValue: 4.2,
    });
  });

  it('returns the open alert instead of flooding the alert center with repeats', async () => {
    const open = { id: 'open-alert', status: AlertStatus.ACKNOWLEDGED };
    alerts.findOne.mockResolvedValueOnce(open);

    await expect(trip()).resolves.toBe(open);
    expect(alerts.save).not.toHaveBeenCalled();
    expect(alerts.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: AlertType.HIGH_LEVEL,
          severity: AlertSeverity.MEDIUM,
          tankId: 'tank-1',
          sensorId: 'sensor-1',
          status: In([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        },
      }),
    );
  });

  it('matches tank-level alerts (no gauge) on a null sensor', async () => {
    alerts.findOne.mockResolvedValueOnce(null);

    await service.createAutomaticAlert(
      AlertType.MAINTENANCE_DUE,
      AlertSeverity.LOW,
      'tank-1',
    );

    expect(alerts.findOne.mock.calls[0][0].where.sensorId).toEqual(IsNull());
  });

  const predictiveTrip = (target = service) =>
    target.createAutomaticAlert(
      AlertType.OVERFLOW_RISK,
      AlertSeverity.CRITICAL,
      'tank-1',
      'sensor-1',
      4.3,
      undefined,
      4.6,
      { predictive: true, etaHours: 1.5 },
      60 * 60 * 1000,
    );

  it('serializes concurrent trips of the same condition', async () => {
    let created: { id: string; status: AlertStatus } | null = null;
    alerts.findOne.mockImplementation(async () => created);
    alerts.save.mockImplementationOnce(async (value: object) => {
      created = { id: 'new-alert', ...value };
      return created;
    });

    await Promise.all([trip(), trip()]);

    expect(alerts.save).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        JSON.stringify([
          AlertType.HIGH_LEVEL,
          AlertSeverity.MEDIUM,
          'tank-1',
          'sensor-1',
        ]),
      ],
    );
  });

  it('opens only one incident for a persistent predictive condition', async () => {
    alerts.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'new-alert', status: AlertStatus.ACTIVE });

    await predictiveTrip();
    await predictiveTrip();

    expect(alerts.save).toHaveBeenCalledTimes(1);
  });

  it('keeps the predictive cooldown in the database across service restarts', async () => {
    const recent = {
      id: 'recent-alert',
      status: AlertStatus.RESOLVED,
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    };
    alerts.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(recent);
    const restarted = new AlertsService(
      alerts as never,
      tanks as never,
      sensors as never,
      {} as never,
      dataSource as never,
    );

    await expect(predictiveTrip(restarted)).resolves.toBe(recent);

    expect(alerts.save).not.toHaveBeenCalled();
    expect(alerts.findOne).toHaveBeenCalledTimes(2);
    expect(alerts.findOne.mock.calls[1][0]).toMatchObject({
      where: {
        type: AlertType.OVERFLOW_RISK,
        severity: AlertSeverity.CRITICAL,
        tankId: 'tank-1',
        sensorId: 'sensor-1',
      },
      order: { createdAt: 'DESC' },
    });
  });
});
