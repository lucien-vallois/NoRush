import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Sensor,
  SensorStatus,
  SensorType,
  SensorProtocol,
} from '../../entities/sensor.entity';
import { ProvisionDeviceDto } from './dto/provision-device.dto';
import { DeviceCredentialsService } from './device-credentials.service';

/** Resposta de provisionamento/rotação: o secret aparece UMA única vez aqui. */
export interface CredentialIssuance {
  sensorId: string;
  sensor: Omit<Sensor, 'credentialHash'>;
  secret: string;
  credentialVersion: number;
  issuedAt: string;
  notice: string;
}

@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    private credentials: DeviceCredentialsService,
  ) {}

  async provision(dto: ProvisionDeviceDto): Promise<CredentialIssuance> {
    let sensor = dto.sensorId
      ? await this.sensorRepository.findOne({
          where: { sensorId: dto.sensorId },
        })
      : null;

    if (sensor) {
      return this.issueCredential(sensor, 'reprovisioned');
    }

    // Novo dispositivo: exige tankId (FK não anulável em sensors).
    if (!dto.tankId) {
      throw new BadRequestException({ code: 'tankIdRequired' });
    }

    const sensorId = dto.sensorId ?? this.generateSensorId();
    sensor = this.sensorRepository.create({
      sensorId,
      name: dto.name ?? `Dispositivo ${sensorId}`,
      tankId: dto.tankId,
      type: dto.type ?? SensorType.MAGNETOSTRICTIVE,
      protocol: dto.protocol ?? SensorProtocol.MQTT,
      model: dto.model,
      manufacturer: dto.manufacturer,
      firmwareVersion: dto.firmwareVersion,
      measurementRangeMin: dto.measurementRangeMin,
      measurementRangeMax: dto.measurementRangeMax,
      status: SensorStatus.ACTIVE, // pronto para o bring-up; a ingestão exige status active
    });

    try {
      sensor = await this.sensorRepository.save(sensor);
    } catch (error) {
      if (String(error?.code) === '23505') {
        throw new ConflictException({ code: 'sensorIdAlreadyExists' });
      }
      if (String(error?.code) === '23503') {
        throw new BadRequestException({ code: 'tankNotFound' });
      }
      throw error;
    }

    this.logger.log(
      `Dispositivo provisionado: ${sensorId} (tank ${dto.tankId})`,
    );
    return this.issueCredential(sensor, 'provisioned');
  }

  async rotate(sensorId: string): Promise<CredentialIssuance> {
    const sensor = await this.findBySensorId(sensorId);
    return this.issueCredential(sensor, 'credential rotated');
  }

  async revoke(
    sensorId: string,
  ): Promise<{ sensorId: string; revokedAt: string }> {
    const sensor = await this.findBySensorId(sensorId);
    // QueryDeepPartialEntity não aceita null na tipagem; em SQL o valor
    // transmitido é NULL para limpar a credencial.
    await this.sensorRepository.update(sensor.id, {
      credentialHash: null as unknown as string,
      credentialVersion: sensor.credentialVersion + 1,
      credentialRotatedAt: new Date(),
    });
    this.logger.warn(`Credencial revogada para ${sensorId}`);
    return { sensorId, revokedAt: new Date().toISOString() };
  }

  async list(): Promise<Record<string, unknown>[]> {
    const sensors = await this.sensorRepository.find({
      order: { createdAt: 'DESC' },
    });
    return sensors.map((s) => this.toDeviceView(s));
  }

  async detail(sensorId: string): Promise<Record<string, unknown>> {
    const sensor = await this.findBySensorId(sensorId);
    return this.toDeviceView(sensor);
  }

  /** Carrega o sensor incluindo o hash (excluído do SELECT padrão). */
  async findWithCredential(sensorId: string): Promise<Sensor | null> {
    return this.sensorRepository
      .createQueryBuilder('sensor')
      .addSelect('sensor.credentialHash')
      .where('sensor.sensorId = :sensorId', { sensorId })
      .getOne();
  }

  private async issueCredential(
    sensor: Sensor,
    action: string,
  ): Promise<CredentialIssuance> {
    const { secret, hash } = this.credentials.generateSecret();
    const credentialVersion = sensor.credentialVersion + 1;
    await this.sensorRepository.update(sensor.id, {
      credentialHash: hash,
      credentialVersion,
      credentialRotatedAt: new Date(),
    });
    const { credentialHash: _omit, ...safeSensor } = sensor;
    return {
      sensorId: sensor.sensorId,
      sensor: safeSensor as Omit<Sensor, 'credentialHash'>,
      secret,
      credentialVersion,
      issuedAt: new Date().toISOString(),
      notice: `Device ${action}. Store the secret now: it will not be shown again. Send it as authToken in the payload or in the X-Device-Token header.`,
    };
  }

  private async findBySensorId(sensorId: string): Promise<Sensor> {
    const sensor = await this.sensorRepository.findOne({
      where: { sensorId },
    });
    if (!sensor)
      throw new NotFoundException({ code: 'sensorNotFound', id: sensorId });
    return sensor;
  }

  private toDeviceView(sensor: Sensor): Record<string, unknown> {
    return {
      sensorId: sensor.sensorId,
      name: sensor.name,
      type: sensor.type,
      protocol: sensor.protocol,
      model: sensor.model,
      manufacturer: sensor.manufacturer,
      firmwareVersion: sensor.firmwareVersion,
      tankId: sensor.tankId,
      status: sensor.status,
      provisioned: sensor.credentialVersion > 0,
      credentialVersion: sensor.credentialVersion,
      credentialRotatedAt: sensor.credentialRotatedAt,
      batteryLevel: sensor.batteryLevel,
      lastTransmissionAt: sensor.lastTransmissionAt,
      transmissionCount: sensor.transmissionCount,
      isOnline: sensor.isOnline(),
    };
  }

  /** Colisão de ID gerado é capturada pelo unique constraint no save(). */
  private generateSensorId(): string {
    return `SENSOR-${String(Math.floor(Math.random() * 900) + 100)}`;
  }
}
