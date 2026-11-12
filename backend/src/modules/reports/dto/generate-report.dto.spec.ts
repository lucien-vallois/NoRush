import { ValidationPipe } from '@nestjs/common';
import { ReportShortcutDto } from './generate-report.dto';

describe('Per-type report shortcuts', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const parse = (value: unknown) =>
    pipe.transform(value, { type: 'body', metatype: ReportShortcutDto });

  it('accepts the same fields as /reports/generate, without a type', async () => {
    await expect(
      parse({
        format: 'excel',
        startDate: '2026-11-01',
        endDate: '2026-11-07',
        tankIds: ['550e8400-e29b-41d4-a716-446655440000'],
      }),
    ).resolves.toMatchObject({ format: 'excel' });
  });

  it.each([
    { format: 'docx' },
    { format: 'pdf', startDate: 'yesterday' },
    { format: 'csv', tankIds: ['FK-01'] },
  ])('validates the body it used to take unchecked: %j', async (body) => {
    await expect(parse(body)).rejects.toMatchObject({ status: 400 });
  });
});
