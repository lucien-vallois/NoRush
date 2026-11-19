import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

// Entities
import { Sensor, SensorStatus } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { Tank } from '../../entities/tank.entity';

// DTOs
import { SensorMessageDto } from './dto/sensor-message.dto';

// Services
import { TanksService } from '../tanks/tanks.service';
import { AlertProcessorService } from '../alerts/alert-processor.service';
import { WsEmitterService } from '../websocket/ws-emitter.service';
import { DeviceCredentialsService } from '../devices/device-credentials.service';
import { evaluateLevelAlarms } from '../alerts/level-alarms';
import { HeartbeatDto } from '../devices/dto/provision-device.dto';

interface ProcessedMessage {
  sensor: Sensor | null;
  reading: Partial<Reading> | null;
  isValid: boolean;
  retryable: boolean;
  validationErrors: string[];
  requiresAlert: boolean;
  alertReason?: string;
}

@Injectable()
export class MessageProcessorService {
  private readonly logger = new Logger(MessageProcessorService.name);
  private readonly counters = { processed: 0, accepted: 0, totalMs: 0 };
  private lastQueueWarningAt = 0;
  private readonly derivedEventsEnabled: boolean;

  constructor(
    @InjectRepository(Sensor)
    private sensorRepository: Repository<Sensor>,
    @InjectRepository(Reading)
    private readingRepository: Repository<Reading>,
    @InjectRepository(Tank)
    private tankRepository: Repository<Tank>,
    @Inject('RABBITMQ_SERVICE')
    private rabbitmqClient: ClientProxy,
    private configService: ConfigService,
    private tanksService: TanksService,
    private alertProcessor: AlertProcessorService,
    private wsEmitter: WsEmitterService,
    private deviceCredentials: DeviceCredentialsService,
  ) {
    this.derivedEventsEnabled =
      this.configService.get<string>('RABBITMQ_ENABLED', 'true') !== 'false';
  }

  /** Every reading (MQTT or HTTP) goes through here. */
  async processSensorMessage(
    message: SensorMessageDto,
  ): Promise<ProcessedMessage> {
    const startedAt = Date.now();
    const result = await this.validateAndStore(message);
    this.counters.processed++;
    if (result.isValid) this.counters.accepted++;
    this.counters.totalMs += Date.now() - startedAt;
    return result;
  }

  getStats() {
    const { processed, accepted, totalMs } = this.counters;
    return {
      totalProcessed: processed,
      accepted,
      rejected: processed - accepted,
      // null until something was processed: 0% would read as "all failing"
      successRate: processed ? (accepted / processed) * 100 : null,
      averageProcessingTimeMs: processed ? totalMs / processed : null,
    };
  }

  private async validateAndStore(
    message: SensorMessageDto,
  ): Promise<ProcessedMessage> {
    const startTime = Date.now();
    const validationErrors: string[] = [];

    if (!message || typeof message !== 'object')
      return this.createErrorResult(message, ['Invalid message']);

    try {
      // 1. Validar estrutura básica da mensagem
      const basicValidation = this.validateBasicMessage(message);
      if (!basicValidation.isValid) {
        validationErrors.push(...basicValidation.errors);
        return this.createErrorResult(message, validationErrors);
      }

      // 2. Buscar sensor no banco (com credencial, para autenticar o dispositivo)
      const sensor = await this.findAndValidateSensor(message.sensorId);
      if (!sensor) {
        validationErrors.push(`Sensor ${message.sensorId} not found`);
        return this.createErrorResult(message, validationErrors);
      }

      // 3. Autenticar: chave compartilhada (modo shared) ou credencial
      //    individual provisionada em /devices (modos device/hybrid)
      const auth = this.deviceCredentials.authenticate(
        sensor,
        message.authToken,
      );
      if (!auth.ok) {
        validationErrors.push(`Authentication refused (${auth.code})`);
        this.logger.warn(
          `Ingestão não autenticada: sensor=${message.sensorId} motivo=${auth.code}`,
        );
        return this.createErrorResult(message, validationErrors);
      }

      // 4. Validar dados específicos do sensor
      const sensorValidation = this.validateSensorData(sensor, message);
      if (!sensorValidation.isValid) {
        validationErrors.push(...sensorValidation.errors);
      }

      // 5. Verificar se o sensor está ativo
      if (sensor.status !== SensorStatus.ACTIVE) {
        validationErrors.push(
          `Sensor ${message.sensorId} is not active (status: ${sensor.status})`,
        );
      }
      if (validationErrors.length)
        return this.createErrorResult(message, validationErrors);

      // 6. Processar dados e criar leitura
      const processedData = await this.processSensorData(sensor, message);

      // 7. Verificar se precisa gerar alerta
      const alertCheck = this.checkAlertConditions(sensor, processedData);

      // 8. Salvar leitura no banco
      const reading = await this.saveReading(sensor, processedData);

      // 9. Atualizar status do sensor
      await this.updateSensorStatus(sensor, message);

      // 10. Publicar mensagem para processamento adicional
      this.publishToQueue(sensor, reading, message);

      // 11. Push em tempo real via WebSocket
      this.wsEmitter.emitReading({
        sensorId: sensor.sensorId,
        tankId: sensor.tankId,
        level: reading.level,
        volume: reading.volume,
        timestamp: reading.timestamp,
      });

      // 12. Avaliar e disparar alertas em tempo real
      if (alertCheck.requiresAlert) {
        await this.alertProcessor.processReadingForAlerts(reading);
        // Payload estruturado (type/threshold/level) para clientes comporem
        // a mensagem no idioma do usuário; `reason` é descritivo (EN, base)
        this.wsEmitter.emitAlert({
          sensorId: sensor.sensorId,
          tankId: sensor.tankId,
          type: alertCheck.type,
          reason: alertCheck.reason,
          level: reading.level,
          threshold: alertCheck.threshold,
          timestamp: new Date().toISOString(),
        });
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Mensagem processada: sensor=${message.sensorId}, nível=${message.level}m, tempo=${processingTime}ms`,
      );

      return {
        sensor,
        reading,
        isValid: validationErrors.length === 0,
        retryable: false,
        validationErrors,
        requiresAlert: alertCheck.requiresAlert,
        alertReason: alertCheck.reason,
      };
    } catch (error) {
      this.logger.error(
        `Erro ao processar mensagem do sensor ${message.sensorId}:`,
        error,
      );
      return {
        ...this.createErrorResult(message, ['Temporary processing failure']),
        retryable: true,
      };
    }
  }

  private validateBasicMessage(message: SensorMessageDto): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!message.sensorId || typeof message.sensorId !== 'string') {
      errors.push('sensorId is required and must be a string');
    }

    if (
      typeof message.level !== 'number' ||
      !Number.isFinite(message.level) ||
      message.level < 0
    ) {
      errors.push('level must be a non-negative number, in meters');
    }

    if (
      message.batteryLevel !== undefined &&
      (!Number.isFinite(message.batteryLevel) ||
        message.batteryLevel < 0 ||
        message.batteryLevel > 100)
    ) {
      errors.push('batteryLevel must be between 0 and 100');
    }

    if (message.timestamp && isNaN(Date.parse(message.timestamp))) {
      errors.push('timestamp must be a valid ISO 8601 date');
    }
    if (
      message.timestamp &&
      Date.parse(message.timestamp) > Date.now() + 30000
    ) {
      errors.push('timestamp cannot be in the future');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async findAndValidateSensor(
    sensorId: string,
  ): Promise<Sensor | null> {
    // credentialHash fica fora do SELECT padrão; autenticação por
    // dispositivo precisa dele explicitamente.
    return this.sensorRepository
      .createQueryBuilder('sensor')
      .addSelect('sensor.credentialHash')
      .leftJoinAndSelect('sensor.tank', 'tank')
      .where('sensor.sensorId = :sensorId', { sensorId })
      .getOne();
  }

  private validateSensorData(
    sensor: Sensor,
    message: SensorMessageDto,
  ): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Verificar faixa de medição
    if (
      sensor.measurementRangeMin != null &&
      message.level < sensor.measurementRangeMin
    ) {
      errors.push(
        `Level ${message.level} m is below the gauge minimum range (${sensor.measurementRangeMin} m)`,
      );
    }

    if (
      sensor.measurementRangeMax != null &&
      message.level > sensor.measurementRangeMax
    ) {
      errors.push(
        `Level ${message.level} m is above the gauge maximum range (${sensor.measurementRangeMax} m)`,
      );
    }
    if (
      sensor.tank?.dimensions?.height &&
      message.level > Number(sensor.tank.dimensions.height)
    ) {
      errors.push('Level is above the tank height');
    }

    // Verificar consistência dos dados de interface óleo-água
    if (message.oilWaterInterface) {
      const { oilLevel, waterLevel, interfaceLevel } =
        message.oilWaterInterface;

      if (
        ![oilLevel, waterLevel, interfaceLevel].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      ) {
        errors.push('Interface values must be finite, non-negative numbers');
      }
      // Millimetre sensor resolution must not be compared with exact float equality.
      if (Math.abs(oilLevel + waterLevel - message.level) > 0.001) {
        errors.push(
          'Oil + water thickness must equal the total level (1 mm tolerance)',
        );
      }

      // oilLevel/waterLevel são espessuras das camadas; interfaceLevel é a
      // altura da interface medida do fundo. Ela precisa estar dentro do
      // líquido — tanques de flowback costumam ter mais água que óleo, então
      // interfaceLevel > oilLevel é um caso normal.
      if (interfaceLevel > message.level + 0.001) {
        errors.push(
          'interfaceLevel must be between the tank bottom and the total level',
        );
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  private async processSensorData(
    sensor: Sensor,
    message: SensorMessageDto,
  ): Promise<Partial<Reading>> {
    const timestamp = message.timestamp
      ? new Date(message.timestamp)
      : new Date();

    // Calcular volume usando a tabela de arqueação do tanque
    let volume: number | undefined;
    try {
      if (sensor.tank) {
        volume = sensor.tank.getVolumeFromLevel(message.level);
      }
    } catch (error) {
      this.logger.warn(
        `Erro ao calcular volume para sensor ${sensor.sensorId}:`,
        error,
      );
    }

    const reading: Partial<Reading> = {
      level: message.level,
      volume: volume,
      oilWaterInterface: message.oilWaterInterface
        ? {
            oilLevel: message.oilWaterInterface.oilLevel,
            waterLevel: message.oilWaterInterface.waterLevel,
            interfaceLevel: message.oilWaterInterface.interfaceLevel,
          }
        : undefined,
      metadata: message.metadata,
      timestamp,
      processedAt: new Date(),
      isCalibrated:
        !!sensor.calibrationDate &&
        new Date(sensor.calibrationDate) <= timestamp &&
        (!sensor.nextCalibrationDate ||
          new Date(sensor.nextCalibrationDate) >= timestamp),
      isProcessed: true,
      quality: this.calculateDataQuality(message),
    };

    // Detecção de anomalia: z-score da leitura contra o histórico recente do sensor
    const anomaly = await this.detectAnomaly(sensor.id, message.level);
    if (anomaly) {
      reading.metadata = {
        ...(message.metadata ?? {}),
        anomaly: true,
        zScore: Number(anomaly.zScore.toFixed(2)),
      };
      this.logger.warn(
        `Anomalia detectada: sensor=${sensor.sensorId} nível=${message.level}m z=${anomaly.zScore.toFixed(2)} (média ${anomaly.mean.toFixed(2)}m)`,
      );
      this.wsEmitter.emit('anomaly', {
        sensorId: sensor.sensorId,
        tankId: sensor.tankId,
        level: message.level,
        zScore: Number(anomaly.zScore.toFixed(2)),
        mean: Number(anomaly.mean.toFixed(3)),
        timestamp: new Date().toISOString(),
      });
    }

    return reading;
  }

  /**
   * Z-score da leitura contra as últimas 20 leituras do sensor.
   * Best-effort: qualquer falha apenas desativa a checagem para esta leitura.
   */
  private async detectAnomaly(
    sensorId: string,
    level: number,
  ): Promise<{ zScore: number; mean: number } | null> {
    try {
      const recent = await this.readingRepository.find({
        where: { sensorId },
        order: { timestamp: 'DESC' },
        take: 20,
        select: { level: true },
      });
      if (recent.length < 10) return null;

      const levels = recent.map((r) => Number(r.level));
      const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
      const variance =
        levels.reduce((acc, l) => acc + (l - mean) ** 2, 0) / levels.length;
      const std = Math.sqrt(variance);
      if (std < 1e-6) return null;

      const zScore = (level - mean) / std;
      return Math.abs(zScore) > 3 ? { zScore, mean } : null;
    } catch {
      return null;
    }
  }

  private checkAlertConditions(
    sensor: Sensor,
    reading: Partial<Reading>,
  ): {
    requiresAlert: boolean;
    reason?: string;
    type?: string;
    threshold?: number;
  } {
    if (!sensor.tank) {
      return { requiresAlert: false };
    }

    // Most severe alarm first: past the overflow limit the realtime event
    // must say "overflow", not the high-level alarm it also trips.
    const [headline] = evaluateLevelAlarms(sensor.tank, reading.level);
    if (!headline) return { requiresAlert: false };

    return {
      requiresAlert: true,
      type: headline.type,
      threshold: headline.threshold,
      reason: headline.reason,
    };
  }

  private async saveReading(
    sensor: Sensor,
    readingData: Partial<Reading>,
  ): Promise<Reading> {
    // insert() em vez de save(): com PK composta, save() interpretaria a
    // entidade como update (timestamp sempre preenchido). id gerado aqui.
    const reading = this.readingRepository.create({
      id: randomUUID(),
      sensorId: sensor.id,
      ...readingData,
    });
    await this.readingRepository.insert(reading);
    return reading;
  }

  private async updateSensorStatus(
    sensor: Sensor,
    message: SensorMessageDto,
  ): Promise<void> {
    const updates: Partial<Sensor> = {
      lastTransmissionAt: new Date(),
      transmissionCount: sensor.transmissionCount + 1,
    };

    // Atualizar nível de bateria se fornecido
    if (message.batteryLevel !== undefined) {
      updates.batteryLevel = message.batteryLevel;
      updates.batteryLastUpdate = new Date();
    }

    await this.sensorRepository.update(sensor.id, updates);
  }

  private publishToQueue(
    sensor: Sensor,
    reading: Reading,
    originalMessage: SensorMessageDto,
  ): void {
    if (!this.derivedEventsEnabled) return;
    try {
      const { authToken, ...telemetry } = originalMessage;
      const queueMessage = {
        sensorId: sensor.sensorId,
        sensor: {
          id: sensor.id,
          type: sensor.type,
          tankId: sensor.tankId,
        },
        reading: {
          id: reading.id,
          level: reading.level,
          volume: reading.volume,
          timestamp: reading.timestamp,
        },
        originalMessage: telemetry,
        processedAt: new Date(),
      };

      // emit() is fire-and-forget (a hot Observable, not a Promise): the
      // reading is already stored, so a broker outage is logged, never fatal,
      // and at most once per minute so an absent broker does not flood logs.
      this.rabbitmqClient
        .emit('sensor.data.processed', queueMessage)
        .subscribe({
          error: (error: unknown) => {
            if (Date.now() - this.lastQueueWarningAt < 60_000) return;
            this.lastQueueWarningAt = Date.now();
            this.logger.warn(
              `Derived events not published (RabbitMQ): ${String(error)}`,
            );
          },
        });
    } catch (error) {
      this.logger.error(
        `Erro ao publicar mensagem na fila para sensor ${sensor.sensorId}:`,
        error,
      );
    }
  }

  private calculateDataQuality(message: SensorMessageDto): number {
    let quality = 100;

    // Reduzir qualidade baseado em fatores
    if (message.metadata?.signalStrength !== undefined) {
      if (message.metadata.signalStrength < -80) quality -= 10;
      else if (message.metadata.signalStrength < -60) quality -= 5;
    }

    if (message.batteryLevel !== undefined && message.batteryLevel < 20) {
      quality -= 15;
    }

    // Verificar consistência dos dados
    if (message.oilWaterInterface) {
      const { oilLevel, waterLevel } = message.oilWaterInterface;
      if (Math.abs(oilLevel + waterLevel - message.level) > 0.01) {
        quality -= 20;
      }
    }

    return Math.max(0, Math.min(100, quality));
  }

  private createErrorResult(
    message: SensorMessageDto,
    errors: string[],
  ): ProcessedMessage {
    return {
      sensor: null,
      reading: null,
      isValid: false,
      retryable: false,
      validationErrors: errors,
      requiresAlert: false,
    };
  }

  // Método para processar mensagens em lote (otimização futura)
  async processBatchMessages(
    messages: SensorMessageDto[],
  ): Promise<ProcessedMessage[]> {
    const results: ProcessedMessage[] = [];

    for (const message of messages) {
      const result = await this.processSensorMessage(message);
      results.push(result);
    }

    return results;
  }

  /**
   * Heartbeat de dispositivo: sinal de vida sem leitura de nível.
   * Atualiza lastTransmissionAt/bateria/firmware para o console mostrar
   * o dispositivo online entre intervalos de medição.
   */
  async processHeartbeat(heartbeat: HeartbeatDto): Promise<{
    received: boolean;
    sensorId: string;
    receivedAt: string;
    reason?: string;
  }> {
    const sensor = await this.findAndValidateSensor(heartbeat.sensorId);
    const auth = this.deviceCredentials.authenticate(
      sensor,
      heartbeat.authToken,
    );
    if (!sensor || !auth.ok) {
      const reason = !sensor
        ? 'sensorNotFound'
        : auth.ok
          ? 'unexpected'
          : auth.code;
      this.logger.warn(
        `Heartbeat recusado: sensor=${heartbeat.sensorId} motivo=${reason}`,
      );
      return {
        received: false,
        sensorId: heartbeat.sensorId,
        receivedAt: new Date().toISOString(),
        reason,
      };
    }

    const updates: Partial<Sensor> = { lastTransmissionAt: new Date() };
    if (heartbeat.batteryLevel !== undefined) {
      updates.batteryLevel = heartbeat.batteryLevel;
      updates.batteryLastUpdate = new Date();
    }
    if (heartbeat.firmwareVersion !== undefined) {
      updates.firmwareVersion = heartbeat.firmwareVersion;
    }
    if (heartbeat.signalStrength !== undefined) {
      updates.configuration = {
        ...(sensor.configuration ?? {}),
        signalStrength: heartbeat.signalStrength,
      };
    }
    await this.sensorRepository.update(sensor.id, updates);

    return {
      received: true,
      sensorId: sensor.sensorId,
      receivedAt: new Date().toISOString(),
    };
  }
}
