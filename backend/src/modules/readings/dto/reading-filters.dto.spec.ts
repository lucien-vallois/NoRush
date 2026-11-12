import { ValidationPipe } from '@nestjs/common';
import { ReadingFiltersDto } from './reading-filters.dto';

describe('Reading query boundaries', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (value: unknown) =>
    pipe.transform(value, { type: 'query', metatype: ReadingFiltersDto });

  it('accepts the documented sort fields and directions', async () => {
    expect(
      await parse({ sortBy: 'level', sortOrder: 'ASC', limit: '50' }),
    ).toMatchObject({ sortBy: 'level', sortOrder: 'ASC', limit: 50 });
  });

  it.each([
    { sortBy: 'level; DROP TABLE readings; --' },
    { sortBy: 'passwordHash' },
    { sortBy: '' },
    { sortOrder: 'desc' },
    { sortOrder: 'asc' },
    { sortOrder: 'ASC DESC' },
    { limit: '1001' },
  ])('rejects invalid query %j', async (value) => {
    // sortBy/sortOrder entram no ORDER BY: nada fora da whitelist passa
    await expect(parse(value)).rejects.toMatchObject({ status: 400 });
  });

  it('reads boolean filters sent as query text', async () => {
    // ?calibratedOnly=true arrives as the string "true" (it used to be a 400)
    expect(
      await parse({ calibratedOnly: 'true', processedOnly: 'false' }),
    ).toMatchObject({ calibratedOnly: true, processedOnly: false });
    await expect(parse({ calibratedOnly: 'yes' })).rejects.toMatchObject({
      status: 400,
    });
  });
});
