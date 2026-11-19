import { ServiceUnavailableException } from '@nestjs/common';
import { HttpService } from './http.service';

describe('HttpService ingestion failures', () => {
  const processor = { processSensorMessage: jest.fn() };
  const sensors = {};
  let service: HttpService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HttpService(processor as never, sensors as never);
  });

  it('returns 503 without internal details when processing is temporarily unavailable', async () => {
    processor.processSensorMessage.mockResolvedValue({
      isValid: false,
      retryable: true,
      validationErrors: ['Temporary processing failure'],
      requiresAlert: false,
    });

    await expect(
      service.processSensorData({ sensorId: 'SENSOR-001', level: 1 }),
    ).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: {
        code: 'ingestionUnavailable',
        message: 'Telemetry processing is temporarily unavailable',
      },
    });
  });

  it('preserves explicit validation refusals', async () => {
    processor.processSensorMessage.mockResolvedValue({
      isValid: false,
      retryable: false,
      validationErrors: ['Level is above the tank height'],
      requiresAlert: false,
    });

    await expect(
      service.processSensorData({ sensorId: 'SENSOR-001', level: 999 }),
    ).resolves.toMatchObject({
      processed: false,
      errors: ['Level is above the tank height'],
    });
  });
});
