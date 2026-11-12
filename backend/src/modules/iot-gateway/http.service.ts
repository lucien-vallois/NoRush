import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Sensor } from '../../entities/sensor.entity';
import { MessageProcessorService } from './message-processor.service';
import { HeartbeatDto } from '../devices/dto/provision-device.dto';
import { SensorMessageDto } from './dto/sensor-message.dto';

export const MAX_BATCH_SIZE = 100;

/** HTTP ingestion: the same validation and processing path as MQTT. */
@Injectable()
export class HttpService {
  private readonly logger = new Logger(HttpService.name);
  private totalRequests = 0;
  private acceptedRequests = 0;

  constructor(
    private readonly messageProcessor: MessageProcessorService,
    @InjectRepository(Sensor)
    private readonly sensorRepository: Repository<Sensor>,
  ) {}

  async processSensorData(sensorMessage: SensorMessageDto) {
    this.totalRequests++;
    const result =
      await this.messageProcessor.processSensorMessage(sensorMessage);
    if (result.isValid) this.acceptedRequests++;

    if (!result.isValid) {
      this.logger.warn(
        `Rejected HTTP reading from ${sensorMessage.sensorId}: ${result.validationErrors.join('; ')}`,
      );
    }

    return {
      sensorId: sensorMessage.sensorId,
      received: true,
      processed: result.isValid,
      timestamp: new Date().toISOString(),
      requestId: `req_${randomUUID()}`,
      ...(result.isValid ? {} : { errors: result.validationErrors }),
      ...(result.requiresAlert
        ? { alert: { triggered: true, reason: result.alertReason } }
        : {}),
    };
  }

  async processBatchSensorData(messages: SensorMessageDto[]) {
    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > MAX_BATCH_SIZE
    ) {
      throw new BadRequestException({
        code: 'batchLimitExceeded',
        max: MAX_BATCH_SIZE,
      });
    }

    this.totalRequests += messages.length;
    const results = await this.messageProcessor.processBatchMessages(messages);
    const processed = results.filter((r) => r.isValid).length;
    this.acceptedRequests += processed;

    this.logger.log(
      `HTTP batch: ${processed} accepted, ${messages.length - processed} rejected`,
    );

    return {
      batchId: `batch_${randomUUID()}`,
      totalMessages: messages.length,
      processedMessages: processed,
      failedMessages: messages.length - processed,
      timestamp: new Date().toISOString(),
      results: results.map((result, index) => ({
        sensorId: messages[index]?.sensorId,
        processed: result.isValid,
        errors: result.validationErrors,
        alert: result.requiresAlert
          ? { triggered: true, reason: result.alertReason }
          : undefined,
      })),
    };
  }

  processHeartbeat(heartbeat: HeartbeatDto) {
    return this.messageProcessor.processHeartbeat(heartbeat);
  }

  /** Connectivity of one gauge, from what it last reported (not a probe). */
  async getSensorStatus(sensorId: string) {
    const sensor = await this.sensorRepository.findOne({ where: { sensorId } });
    if (!sensor) {
      throw new NotFoundException({ code: 'sensorNotFound', id: sensorId });
    }

    const signal = sensor.configuration?.signalStrength as unknown;
    return {
      sensorId: sensor.sensorId,
      status: sensor.status,
      // Same rule as the console: reported within the last 5 minutes.
      connected: sensor.isOnline(),
      lastSeen: sensor.lastTransmissionAt?.toISOString() ?? null,
      batteryLevel: sensor.batteryLevel ?? null,
      signalStrength: typeof signal === 'number' ? signal : null,
      firmwareVersion: sensor.firmwareVersion ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  getStats() {
    return {
      totalRequests: this.totalRequests,
      acceptedRequests: this.acceptedRequests,
    };
  }

  /** Development-only helper behind the admin /iot/test/simulate route. */
  simulateHttpData(sensorId: string, level: number) {
    return this.processSensorData({
      sensorId,
      level,
      batteryLevel: Math.random() * 100,
      timestamp: new Date().toISOString(),
      metadata: {
        signalStrength: -Math.random() * 80 - 20,
        temperature: 20 + Math.random() * 10,
      },
    });
  }
}
