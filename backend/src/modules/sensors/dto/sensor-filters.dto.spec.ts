import { ValidationPipe } from '@nestjs/common';
import { SensorFiltersDto } from './sensor-filters.dto';

describe('Gauge list query', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (value: unknown) =>
    pipe.transform(value, { type: 'query', metatype: SensorFiltersDto });

  it('reads boolean filters sent as query text', async () => {
    expect(
      await parse({
        onlineOnly: 'true',
        needsCalibration: 'false',
        lowBattery: 'true',
      }),
    ).toMatchObject({
      onlineOnly: true,
      needsCalibration: false,
      lowBattery: true,
    });
  });

  it('still refuses anything that is not true or false', async () => {
    await expect(parse({ lowBattery: '1' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
