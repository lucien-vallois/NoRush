import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('API health', () => {
  const dataSource = { query: jest.fn() };
  const gateway = { getStats: jest.fn() };
  let service: AppService;
  let controller: AppController;
  beforeEach(() => {
    dataSource.query.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    gateway.getStats.mockReturnValue({ mqtt: { connected: true } });
    service = new AppService(dataSource as never, gateway as never);
    controller = new AppController(service);
  });
  it('identifies the application', () =>
    expect(controller.getHello()).toBe('NoRush Operations API'));
  it('checks the database and MQTT rather than reporting fixed status', async () => {
    expect((await controller.health()).components).toEqual({
      api: 'up',
      database: 'up',
      mqtt: 'up',
    });
    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });
  it('reports degraded MQTT while HTTP and database remain available', async () => {
    gateway.getStats.mockReturnValue({ mqtt: { connected: false } });
    expect((await controller.health()).status).toBe('degraded');
  });
  it('returns service unavailable when the database fails without leaking the error', async () => {
    dataSource.query.mockRejectedValue(
      new Error('private database credentials'),
    );
    await expect(controller.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(JSON.stringify(await service.getHealth())).not.toContain(
      'credentials',
    );
  });
});
