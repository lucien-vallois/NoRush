import { ValidationPipe } from '@nestjs/common';
import { AlertFiltersDto } from './alert-filters.dto';

describe('Alert query boundaries', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (value: unknown) =>
    pipe.transform(value, { type: 'query', metatype: AlertFiltersDto });
  it('converts pagination and preserves false boolean query values', async () => {
    expect(
      await parse({
        page: '2',
        limit: '12',
        criticalOnly: 'false',
        unacknowledgedOnly: 'true',
      }),
    ).toMatchObject({
      page: 2,
      limit: 12,
      criticalOnly: false,
      unacknowledgedOnly: true,
    });
  });
  it.each([
    { limit: '0' },
    { limit: '101' },
    { page: '-1' },
    { page: '1.5' },
    { sortBy: 'unsupported' },
    { sortOrder: 'invalid' },
    { criticalOnly: 'maybe' },
  ])('rejects invalid query %j', async (value) => {
    await expect(parse(value)).rejects.toMatchObject({ status: 400 });
  });
});
