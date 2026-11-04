import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DeviceCredentialsService } from './device-credentials.service';
import { createHash } from 'crypto';

describe('DevicesService (provisioning lifecycle)', () => {
  const saved: any[] = [];
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let sensor: any;

  const repo = () => ({
    findOne: jest.fn(async () => sensor),
    find: jest.fn(async () => [sensor]),
    create: jest.fn((value: Record<string, unknown>) => ({ ...value })),
    save: jest.fn(async (value: any) => {
      saved.push(value);
      sensor = { ...value };
      return sensor;
    }),
    update: jest.fn(async (id: string, patch: Record<string, unknown>) => {
      updates.push({ id, patch });
      Object.assign(sensor, patch);
    }),
    createQueryBuilder: () => ({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(sensor),
    }),
  });

  const build = () => {
    const repository = repo();
    const credentials = new DeviceCredentialsService(new ConfigService());
    return {
      repository,
      service: new DevicesService(repository as never, credentials),
    };
  };

  beforeEach(() => {
    saved.length = 0;
    updates.length = 0;
    sensor = {
      id: 'uuid-1',
      sensorId: 'SENSOR-101',
      name: 'Boia de teste',
      status: 'active',
      credentialVersion: 0,
      credentialHash: null,
      transmissionCount: 0,
      batteryLevel: 80,
      tankId: 'tank-uuid',
      isOnline: () => false,
    };
  });

  it('provisions an existing sensor and returns the secret exactly once', async () => {
    const { service, repository } = build();
    const issuance = await service.provision({
      sensorId: 'SENSOR-101',
      tankId: 'tank-uuid',
    });

    expect(issuance.secret).toMatch(/^nrk_[A-Za-z0-9_-]{43}$/);
    // o hash persistido é sha256 do secret; o secret em claro nunca é gravado
    expect(updates[0].patch.credentialHash).toBe(
      createHash('sha256').update(issuance.secret).digest('hex'),
    );
    expect(issuance.credentialVersion).toBe(1);
    expect(repository.save).not.toHaveBeenCalled(); // sensor já existia
  });

  it('creates a new sensor when tankId is provided', async () => {
    sensor = null; // SENSOR-201 não existe
    const { service, repository } = build();
    const issuance = await service.provision({
      sensorId: 'SENSOR-201',
      tankId: 'tank-uuid',
      firmwareVersion: '0.9.0-rc1',
    });

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      sensorId: 'SENSOR-201',
      tankId: 'tank-uuid',
      status: 'active',
      firmwareVersion: '0.9.0-rc1',
    });
    expect(issuance.secret).toMatch(/^nrk_/);
  });

  it('rotating increments the version and stores a different hash', async () => {
    const { service } = build();
    const first = await service.rotate('SENSOR-101');
    const second = await service.rotate('SENSOR-101');

    expect(second.secret).not.toBe(first.secret);
    expect(second.credentialVersion).toBe(first.credentialVersion + 1);
  });

  it('revoking clears the hash and bumps the version', async () => {
    const { service } = build();
    await service.rotate('SENSOR-101');
    const result = await service.revoke('SENSOR-101');

    expect(result.revokedAt).toBeTruthy();
    const last = updates[updates.length - 1].patch;
    expect(last.credentialHash).toBeNull();
    expect(last.credentialVersion).toBe(2);
  });

  it('listing exposes provisioning state without the hash', async () => {
    const { service } = build();
    await service.rotate('SENSOR-101');
    const [view] = await service.list();

    expect(view).toMatchObject({
      sensorId: 'SENSOR-101',
      provisioned: true,
      credentialVersion: 1, // uma rotação a partir da versão 0
    });
    expect(JSON.stringify(view)).not.toContain('credentialHash');
    expect(JSON.stringify(view)).not.toMatch(/nrk_/);
  });

  it('unknown sensor throws NotFoundException on rotate/revoke', async () => {
    sensor = null;
    const { service } = build();
    await expect(service.rotate('SENSOR-404')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.revoke('SENSOR-404')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
