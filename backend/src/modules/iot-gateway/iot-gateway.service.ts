import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MqttService } from './mqtt.service';
import { HttpService } from './http.service';
import { MessageProcessorService } from './message-processor.service';

/** Counters since the API started; they reset on restart. */
export interface GatewayStats {
  mqtt: {
    enabled: boolean;
    connected: boolean;
    reconnectAttempts: number;
    messagesReceived: number;
  };
  http: {
    totalRequests: number;
    acceptedRequests: number;
  };
  processor: ReturnType<MessageProcessorService['getStats']>;
  uptime: number;
  timestamp: string;
}

@Injectable()
export class IotGatewayService implements OnModuleInit {
  private readonly logger = new Logger(IotGatewayService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mqttService: MqttService,
    private readonly httpService: HttpService,
    private readonly messageProcessor: MessageProcessorService,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit(): void {
    const mqtt = this.mqttService.getConnectionStatus();
    if (mqtt.enabled && !mqtt.connected) {
      this.logger.warn('MQTT not connected yet at startup; retrying in the background');
    }
  }

  getStats(): GatewayStats {
    const mqtt = this.mqttService.getConnectionStatus();
    return {
      mqtt: {
        enabled: mqtt.enabled,
        connected: mqtt.connected,
        reconnectAttempts: mqtt.reconnectAttempts,
        messagesReceived: mqtt.messagesReceived,
      },
      http: this.httpService.getStats(),
      processor: this.messageProcessor.getStats(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  /** Live checks only: RabbitMQ is not probed, so it is reported as null. */
  async testConnectivity() {
    const mqtt = this.mqttService.getConnectionStatus();
    let database = false;
    try {
      await this.dataSource.query('SELECT 1');
      database = true;
    } catch (error) {
      this.logger.error('Database connectivity check failed:', error);
    }

    return {
      mqtt: mqtt.enabled ? mqtt.connected : null,
      rabbitmq: null as boolean | null,
      database,
      timestamp: new Date().toISOString(),
    };
  }

  /** Effective ingestion settings, without credentials. */
  getConfiguration() {
    const mqtt = this.mqttService.getConnectionStatus();
    return {
      mqtt: {
        enabled: mqtt.enabled,
        host: this.configService.get<string>('MQTT_HOST', 'localhost'),
        port: Number(this.configService.get('MQTT_PORT', 1883)),
        topics: {
          sensorData: this.configService.get<string>(
            'MQTT_TOPIC_SENSOR_DATA',
            'sensors/data',
          ),
          devices: [
            'devices/{sensorId}/telemetry',
            'devices/{sensorId}/status',
            'devices/{sensorId}/commands/responses',
          ],
        },
      },
      http: {
        endpoints: [
          '/iot/sensors/data',
          '/iot/sensors/batch',
          '/iot/sensors/heartbeat',
        ],
      },
      ingestAuthMode: this.configService.get<string>('IOT_AUTH_MODE', 'shared'),
      derivedEvents: {
        enabled:
          this.configService.get<string>('RABBITMQ_ENABLED', 'true') !==
          'false',
        queue: 'sensor_data_queue',
      },
    };
  }

  restartConnections() {
    const reconnecting = this.mqttService.reconnect();
    return {
      mqtt: { reconnecting },
      timestamp: new Date().toISOString(),
    };
  }

  /** Development-only helper behind the admin /iot/test/simulate route. */
  async simulateSensorData(
    sensorId: string,
    options?: { protocol?: 'mqtt' | 'http'; count?: number },
  ) {
    const { protocol = 'mqtt', count = 1 } = options || {};
    const results: unknown[] = [];

    for (let i = 0; i < count; i++) {
      const level = 1 + Math.random() * 4;
      try {
        if (protocol === 'mqtt') {
          await this.mqttService.simulateSensorData(sensorId, level);
          results.push({ sensorId, protocol: 'mqtt', level, status: 'sent' });
        } else {
          const result = await this.httpService.simulateHttpData(
            sensorId,
            level,
          );
          results.push({
            sensorId,
            protocol: 'http',
            level,
            status: 'processed',
            result,
          });
        }
        if (count > 1) await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        results.push({
          sensorId,
          protocol,
          level,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      simulationId: `sim_${Date.now()}`,
      totalSimulations: count,
      results,
      timestamp: new Date().toISOString(),
    };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  healthCheck(): void {
    const { mqtt, processor } = this.getStats();
    if (mqtt.enabled && !mqtt.connected) {
      this.logger.warn('MQTT broker unreachable; the client keeps retrying');
    }
    // Only meaningful once there is traffic; a quiet gateway is not failing.
    if (processor.totalProcessed >= 20 && (processor.successRate ?? 100) < 95) {
      this.logger.warn(
        `Ingestion acceptance below 95%: ${processor.successRate!.toFixed(1)}% of ${processor.totalProcessed} readings`,
      );
    }
  }
}
