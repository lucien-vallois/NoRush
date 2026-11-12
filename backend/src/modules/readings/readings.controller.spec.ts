import { BadRequestException, ParseIntPipe } from '@nestjs/common';
import { ReadingsController } from './readings.controller';

describe('Reading history cleanup', () => {
  const service = { deleteOldReadings: jest.fn(async () => 12) };
  const controller = new ReadingsController(service as never);

  beforeEach(() => jest.clearAllMocks());

  it('refuses a retention below one day instead of deleting everything', async () => {
    await expect(controller.cleanupOldReadings(0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.cleanupOldReadings(-5)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.deleteOldReadings).not.toHaveBeenCalled();
  });

  it('keeps the requested number of days', async () => {
    await expect(controller.cleanupOldReadings(30)).resolves.toMatchObject({
      deletedReadings: 12,
      daysKept: 30,
    });
    expect(service.deleteOldReadings).toHaveBeenCalledWith(30);
  });

  it('parses the query text as an integer and rejects anything else', async () => {
    const pipe = new ParseIntPipe();
    const meta = { type: 'query' as const, data: 'daysToKeep' };
    await expect(pipe.transform('0', meta)).resolves.toBe(0);
    await expect(pipe.transform('abc', meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
