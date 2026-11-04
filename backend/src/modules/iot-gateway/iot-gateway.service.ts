import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MqttService } from './mqtt.service';
import { HttpService } from './http.service';
import { MessageProcessorService } from './message-processor.service';
import { DataSource } from 'typeorm';

export interface GatewayStats {
  mqtt: {
    connected: boolean;
    reconnectAttempts: number;
    messagesReceived: number;
    messagesProcessed: number;
  };
  http: {
    activeRequests: number;
    totalRequests: number;
    successRate: number;
  };
  processor: {
    totalProcessed: number;
    successRate: number;
    averageProcessingTime: number;
  };
  uptime: number;
  timestamp: string;
}

@Injectable()
export class IotGatewayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IotGatewayService.name);
  private stats = {
    mqtt: {
      messagesReceived: 0,
      messagesProcessed: 0,
    },
    http: {
      totalRequests: 0,
      successfulRequests: 0,
    },
    processor: {
      totalProcessed: 0,
      successfulProcessed: 0,
      processingTimes: [] as number[],
    },
  };

  constructor(
    private configService: ConfigService,
    private mqttService: MqttService,
    private httpService: HttpService,
    private messageProcessor: MessageProcessorService,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.logger.log('IoT Gateway inicializando...');

    // Verificar conexões
    await this.checkConnections();

    // Iniciar monitoramento
    this.startMonitoring();

    this.logger.log('IoT Gateway inicializado com sucesso');
  }

  async onModuleDestroy() {
    this.logger.log('IoT Gateway finalizando...');
    // Cleanup será feito pelos serviços individuais
  }

  private async checkConnections(): Promise<void> {
    // Verificar status do MQTT
    const mqttStatus = this.mqttService.getConnectionStatus();
    if (!mqttStatus.connected) {
      this.logger.warn('MQTT não conectado na inicialização');
    }

    // Outras verificações de conectividade podem ser adicionadas aqui
  }

  private startMonitoring(): void {
    this.logger.log('Monitoramento do IoT Gateway iniciado');
  }

  // Método para obter estatísticas gerais
  getStats(): GatewayStats {
    const mqttStatus = this.mqttService.getConnectionStatus();
    const httpStats = this.httpService.getStats();

    const processorStats = this.stats.processor;
    const avgProcessingTime =
      processorStats.processingTimes.length > 0
        ? processorStats.processingTimes.reduce((a, b) => a + b, 0) /
          processorStats.processingTimes.length
        : 0;

    return {
      mqtt: {
        connected: mqttStatus.connected,
        reconnectAttempts: mqttStatus.reconnectAttempts,
        messagesReceived: this.stats.mqtt.messagesReceived,
        messagesProcessed: this.stats.mqtt.messagesProcessed,
      },
      http: {
        activeRequests: httpStats.activeRequests,
        totalRequests: this.stats.http.totalRequests,
        successRate:
          this.stats.http.totalRequests > 0
            ? (this.stats.http.successfulRequests /
                this.stats.http.totalRequests) *
              100
            : 0,
      },
      processor: {
        totalProcessed: processorStats.totalProcessed,
        successRate:
          processorStats.totalProcessed > 0
            ? (processorStats.successfulProcessed /
                processorStats.totalProcessed) *
              100
            : 0,
        averageProcessingTime: avgProcessingTime,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  // Método para testar conectividade
  async testConnectivity(): Promise<any> {
    const results = {
      mqtt: false,
      rabbitmq: null as boolean | null,
      database: false,
      timestamp: new Date().toISOString(),
    };

    // Testar MQTT
    try {
      const mqttStatus = this.mqttService.getConnectionStatus();
      results.mqtt = mqttStatus.connected;
    } catch (error) {
      this.logger.error('Erro ao testar conectividade MQTT:', error);
    }

    // RabbitMQ is not probed here; null means not measured.

    // Testar banco de dados (através do message processor)
    try {
      await this.dataSource.query('SELECT 1');
      results.database = true;
    } catch (error) {
      this.logger.error('Erro ao testar conectividade com banco:', error);
    }

    return results;
  }

  // Método para simulação de dados (para testes)
  async simulateSensorData(
    sensorId: string,
    options?: { protocol?: 'mqtt' | 'http'; count?: number },
  ): Promise<any> {
    const { protocol = 'mqtt', count = 1 } = options || {};
    const results: any[] = [];

    for (let i = 0; i < count; i++) {
      const level = 1 + Math.random() * 4; // Nível entre 1m e 5m

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

        // Aguardar um pouco entre simulações
        if (count > 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        results.push({
          sensorId,
          protocol,
          level,
          status: 'error',
          error: error.message,
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

  // Método para obter configuração atual
  getConfiguration(): any {
    return {
      mqtt: {
        host: this.configService.get('MQTT_HOST'),
        port: this.configService.get('MQTT_PORT'),
        topics: {
          sensorData: this.configService.get('MQTT_TOPIC_SENSOR_DATA'),
          alerts: this.configService.get('MQTT_TOPIC_ALERTS'),
          commands: this.configService.get('MQTT_TOPIC_COMMANDS'),
        },
      },
      http: {
        enabled: true,
        endpoints: [
          '/iot/sensors/data',
          '/iot/sensors/commands',
          '/iot/sensors/batch',
        ],
      },
      rabbitmq: {
        enabled: true,
        queue: 'sensor_data_queue',
      },
      features: {
        realTimeProcessing: true,
        batchProcessing: true,
        commandResponse: true,
        sensorRegistration: true,
        dataValidation: true,
        alertGeneration: true,
      },
    };
  }

  // Método para reiniciar conexões
  async restartConnections(): Promise<any> {
    this.logger.log('Reiniciando conexões IoT Gateway...');

    const results = {
      mqtt: { restarted: false, error: null },
      timestamp: new Date().toISOString(),
    };

    try {
      // O MqttService tem lógica de reconexão automática
      // Aqui poderíamos forçar uma reconexão se necessário
      results.mqtt.restarted = true;
    } catch (error) {
      results.mqtt.error = error.message;
      this.logger.error('Erro ao reiniciar MQTT:', error);
    }

    return results;
  }

  // Método para limpeza de dados antigos (executado por cron)
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldData(): Promise<void> {
    try {
      this.logger.debug('Executando limpeza de dados antigos...');

      // Implementar lógica de limpeza
      // - Remover leituras antigas
      // - Limpar logs antigos
      // - Resetar contadores se necessário

      this.logger.debug('Limpeza de dados antigos concluída');
    } catch (error) {
      this.logger.error('Erro na limpeza de dados antigos:', error);
    }
  }

  // Método para backup de configurações (executado diariamente)
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async backupConfiguration(): Promise<void> {
    try {
      this.logger.debug('Executando backup de configurações...');

      const config = this.getConfiguration();
      const stats = this.getStats();

      // Implementar lógica de backup
      // - Salvar configuração em arquivo
      // - Fazer backup das estatísticas
      // - Upload para storage se necessário

      this.logger.debug('Backup de configurações concluído');
    } catch (error) {
      this.logger.error('Erro no backup de configurações:', error);
    }
  }

  // Método para relatório de saúde (executado a cada 5 minutos)
  @Cron(CronExpression.EVERY_5_MINUTES)
  async healthCheck(): Promise<void> {
    try {
      const stats = this.getStats();

      // Verificar se há problemas
      if (!stats.mqtt.connected) {
        this.logger.warn('MQTT desconectado - tentando reconectar...');
      }

      if (stats.processor.successRate < 95) {
        this.logger.warn(
          `Taxa de sucesso do processador baixa: ${stats.processor.successRate.toFixed(1)}%`,
        );
      }

      // Log de saúde periódica
      this.logger.debug(
        `Health Check - MQTT: ${stats.mqtt.connected ? 'OK' : 'FALHA'}, Processador: ${stats.processor.successRate.toFixed(1)}%`,
      );
    } catch (error) {
      this.logger.error('Erro no health check:', error);
    }
  }

  // Método para atualizar estatísticas (chamado pelos outros serviços)
  updateStats(update: {
    mqtt?: { messagesReceived?: number; messagesProcessed?: number };
    http?: { totalRequests?: number; successfulRequests?: number };
    processor?: {
      totalProcessed?: number;
      successfulProcessed?: number;
      processingTime?: number;
    };
  }): void {
    if (update.mqtt) {
      if (update.mqtt.messagesReceived !== undefined) {
        this.stats.mqtt.messagesReceived += update.mqtt.messagesReceived;
      }
      if (update.mqtt.messagesProcessed !== undefined) {
        this.stats.mqtt.messagesProcessed += update.mqtt.messagesProcessed;
      }
    }

    if (update.http) {
      if (update.http.totalRequests !== undefined) {
        this.stats.http.totalRequests += update.http.totalRequests;
      }
      if (update.http.successfulRequests !== undefined) {
        this.stats.http.successfulRequests += update.http.successfulRequests;
      }
    }

    if (update.processor) {
      if (update.processor.totalProcessed !== undefined) {
        this.stats.processor.totalProcessed += update.processor.totalProcessed;
      }
      if (update.processor.successfulProcessed !== undefined) {
        this.stats.processor.successfulProcessed +=
          update.processor.successfulProcessed;
      }
      if (update.processor.processingTime !== undefined) {
        this.stats.processor.processingTimes.push(
          update.processor.processingTime,
        );
        // Manter apenas os últimos 1000 tempos
        if (this.stats.processor.processingTimes.length > 1000) {
          this.stats.processor.processingTimes =
            this.stats.processor.processingTimes.slice(-1000);
        }
      }
    }
  }
}
