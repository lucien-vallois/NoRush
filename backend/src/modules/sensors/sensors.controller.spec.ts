import { BadRequestException } from '@nestjs/common';
import { SensorsController } from './sensors.controller';
import { MAX_BULK_SENSORS } from './sensors.service';

describe('Bulk gauge calibration', () => {
  const service = {
    updateCalibrationDate: jest.fn(async (id: string, _date: Date) => ({ id })),
  };
  const controller = new SensorsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [{}],
    [{ sensorIds: [] }],
    [{ sensorIds: 'SENSOR-001' }],
    [{ sensorIds: Array.from({ length: MAX_BULK_SENSORS + 1 }, String) }],
  ])('refuses %j before touching any gauge', async (body) => {
    await expect(
      controller.bulkRegisterCalibration(body as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.updateCalibrationDate).not.toHaveBeenCalled();
  });

  it('records today as the calibration date of each gauge', async () => {
    await expect(
      controller.bulkRegisterCalibration({ sensorIds: ['a', 'b'] }),
    ).resolves.toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(service.updateCalibrationDate).toHaveBeenCalledTimes(2);
    expect(service.updateCalibrationDate.mock.calls[0][1]).toBeInstanceOf(Date);
  });
});
