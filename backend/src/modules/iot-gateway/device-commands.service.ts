import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { MqttService } from './mqtt.service';
import {
  SensorCommandDto,
  SensorCommandResponseDto,
} from './dto/sensor-message.dto';

export const DEVICE_COMMANDS = [
  'CALIBRATE',
  'RESET',
  'UPDATE_CONFIG',
  'DIAGNOSTIC',
  'SHUTDOWN',
] as const;

/** A device that has not answered within this window is reported TIMEOUT. */
export const COMMAND_TIMEOUT_MS = 60_000;
/** Finished commands stay queryable for this long, then are forgotten. */
const COMMAND_RETENTION_MS = 5 * 60_000;

type CommandStatus = SensorCommandResponseDto['status'];

interface TrackedCommand {
  sensorId: string;
  command: SensorCommandDto['command'];
  sentAt: number;
  status: CommandStatus;
  message?: string;
  data?: Record<string, unknown>;
  answeredAt?: number;
}

/**
 * Device commands over MQTT, following the hardware integration contract
 * (docs/hardware-integration.md, section 7): NoRush publishes on
 * `devices/{sensorId}/commands` and the device answers on
 * `devices/{sensorId}/commands/responses` with the same requestId.
 *
 * The status of a command is what the device reported: PENDING until it
 * answers, TIMEOUT if it does not answer in time. Nothing is assumed.
 * Tracking is in memory, so it does not survive an API restart.
 */
@Injectable()
export class DeviceCommandsService {
  private readonly commands = new Map<string, TrackedCommand>();

  constructor(private readonly mqtt: MqttService) {
    this.mqtt.onCommandResponse((sensorId, response) =>
      this.recordResponse(sensorId, response),
    );
  }

  async send(dto: SensorCommandDto): Promise<SensorCommandResponseDto> {
    if (!(DEVICE_COMMANDS as readonly string[]).includes(dto.command)) {
      throw new BadRequestException({
        code: 'invalidCommand',
        command: dto.command,
      });
    }
    if (dto.command === 'UPDATE_CONFIG' && !dto.parameters) {
      throw new BadRequestException({ code: 'updateConfigNeedsParameters' });
    }
    if (!this.mqtt.getConnectionStatus().connected) {
      throw new ServiceUnavailableException({ code: 'mqttUnavailable' });
    }

    this.prune();
    const requestId = dto.requestId ?? `cmd_${randomUUID()}`;
    if (this.commands.has(requestId)) {
      throw new BadRequestException({
        code: 'commandRequestIdInUse',
        requestId,
      });
    }

    await this.mqtt.sendDeviceCommand(dto.sensorId, {
      requestId,
      command: dto.command,
      parameters: dto.parameters ?? {},
    });

    const sentAt = Date.now();
    this.commands.set(requestId, {
      sensorId: dto.sensorId,
      command: dto.command,
      sentAt,
      status: 'PENDING',
    });

    return {
      sensorId: dto.sensorId,
      requestId,
      status: 'PENDING',
      message: `${dto.command} published to the device`,
      timestamp: new Date(sentAt).toISOString(),
    };
  }

  status(requestId: string) {
    this.prune();
    const tracked = this.commands.get(requestId);
    if (!tracked) {
      throw new NotFoundException({
        code: 'commandRequestNotFound',
        requestId,
      });
    }

    if (
      tracked.status === 'PENDING' &&
      Date.now() - tracked.sentAt > COMMAND_TIMEOUT_MS
    ) {
      tracked.status = 'TIMEOUT';
      tracked.message = 'The device did not answer in time';
    }

    return {
      requestId,
      sensorId: tracked.sensorId,
      command: tracked.command,
      status: tracked.status,
      message: tracked.message,
      data: tracked.data,
      sentAt: new Date(tracked.sentAt).toISOString(),
      answeredAt: tracked.answeredAt
        ? new Date(tracked.answeredAt).toISOString()
        : undefined,
    };
  }

  /**
   * A response counts only for a command still pending, addressed to the
   * same device that answers (topic binding is checked by MqttService).
   */
  recordResponse(sensorId: string, response: unknown): boolean {
    if (!response || typeof response !== 'object') return false;
    const { requestId, status, message, data } = response as Record<
      string,
      unknown
    >;
    if (typeof requestId !== 'string') return false;

    const tracked = this.commands.get(requestId);
    if (!tracked || tracked.sensorId !== sensorId) return false;
    if (tracked.status !== 'PENDING') return false;
    if (status !== 'SUCCESS' && status !== 'FAILED') return false;

    tracked.status = status;
    tracked.answeredAt = Date.now();
    if (typeof message === 'string') tracked.message = message;
    if (data && typeof data === 'object') {
      tracked.data = data as Record<string, unknown>;
    }
    return true;
  }

  private prune(): void {
    const cutoff = Date.now() - COMMAND_TIMEOUT_MS - COMMAND_RETENTION_MS;
    for (const [requestId, tracked] of this.commands) {
      if (tracked.sentAt < cutoff) this.commands.delete(requestId);
    }
  }
}
