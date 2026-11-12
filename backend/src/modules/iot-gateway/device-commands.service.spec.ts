import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  COMMAND_TIMEOUT_MS,
  DeviceCommandsService,
} from './device-commands.service';
import type { CommandResponseHandler } from './mqtt.service';

describe('DeviceCommandsService', () => {
  let connected: boolean;
  let deliver: CommandResponseHandler;
  const mqtt = {
    getConnectionStatus: jest.fn(() => ({ connected })),
    sendDeviceCommand: jest.fn(async () => undefined),
    onCommandResponse: jest.fn((handler: CommandResponseHandler) => {
      deliver = handler;
    }),
  };
  let service: DeviceCommandsService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    connected = true;
    service = new DeviceCommandsService(mqtt as never);
  });

  const send = (extra: Record<string, unknown> = {}) =>
    service.send({
      sensorId: 'SENSOR-001',
      command: 'DIAGNOSTIC',
      ...extra,
    } as never);

  it('publishes on the device topic and starts as PENDING (no invented outcome)', async () => {
    const sent = await send();

    expect(mqtt.sendDeviceCommand).toHaveBeenCalledWith('SENSOR-001', {
      requestId: sent.requestId,
      command: 'DIAGNOSTIC',
      parameters: {},
    });
    expect(sent.status).toBe('PENDING');
    expect(service.status(sent.requestId).status).toBe('PENDING');
  });

  it('reports exactly what the device answered', async () => {
    const { requestId } = await send();

    deliver('SENSOR-001', {
      requestId,
      status: 'FAILED',
      message: 'float stuck',
      data: { code: 7 },
    });

    expect(service.status(requestId)).toMatchObject({
      status: 'FAILED',
      message: 'float stuck',
      data: { code: 7 },
    });
  });

  it('ignores answers from another device or with an unknown status', async () => {
    const { requestId } = await send();

    deliver('SENSOR-002', { requestId, status: 'SUCCESS' });
    deliver('SENSOR-001', { requestId, status: 'DONE' });
    deliver('SENSOR-001', 'not json');

    expect(service.status(requestId).status).toBe('PENDING');
  });

  it('times out when the device stays silent', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00Z') });
    const { requestId } = await send();

    jest.setSystemTime(Date.now() + COMMAND_TIMEOUT_MS + 1);

    expect(service.status(requestId).status).toBe('TIMEOUT');
    // A late answer does not rewrite a timed-out command
    deliver('SENSOR-001', { requestId, status: 'SUCCESS' });
    expect(service.status(requestId).status).toBe('TIMEOUT');
  });

  it('refuses unknown commands, UPDATE_CONFIG without parameters and reused ids', async () => {
    await expect(send({ command: 'OPEN_VALVE' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(send({ command: 'UPDATE_CONFIG' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await send({ requestId: 'req-1' });
    await expect(send({ requestId: 'req-1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('does not pretend to send when the broker is down', async () => {
    connected = false;

    await expect(send()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(mqtt.sendDeviceCommand).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown request id', () => {
    expect(() => service.status('nope')).toThrow(NotFoundException);
  });
});
