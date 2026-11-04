import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageProcessorService } from './message-processor.service';
import { HeartbeatDto } from '../devices/dto/provision-device.dto';
import {
  SensorMessageDto,
  SensorCommandDto,
  SensorCommandResponseDto,
} from './dto/sensor-message.dto';

@Injectable()
export class HttpService implements OnModuleDestroy {
  private readonly logger = new Logger(HttpService.name);
  private activeRequests = new Map<string, { timestamp: Date; data: any }>();
  private readonly maxRequestAge = 5 * 60 * 1000; // 5 minutos
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor(
    private configService: ConfigService,
    private messageProcessor: MessageProcessorService,
  ) {
    // Limpar requests antigos periodicamente
    this.cleanupInterval = setInterval(() => this.cleanupOldRequests(), 60000); // A cada minuto
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupInterval);
  }

  async processSensorData(sensorMessage: SensorMessageDto): Promise<any> {
    try {
      this.logger.log(
        `Recebendo dados via HTTP do sensor: ${sensorMessage.sensorId}`,
      );

      // Processar mensagem
      const result =
        await this.messageProcessor.processSensorMessage(sensorMessage);

      // Preparar resposta
      const response: {
        sensorId: string;
        received: boolean;
        processed: boolean;
        timestamp: string;
        requestId: string;
        errors?: string[];
        alert?: { triggered: boolean; reason?: string };
      } = {
        sensorId: sensorMessage.sensorId,
        received: true,
        processed: result.isValid,
        timestamp: new Date().toISOString(),
        requestId: this.generateRequestId(),
      };

      if (!result.isValid) {
        response.processed = false;
        response.errors = result.validationErrors;
        this.logger.warn(
          `Dados inválidos do sensor ${sensorMessage.sensorId}:`,
          result.validationErrors,
        );
      } else {
        this.logger.debug(
          `Dados processados com sucesso do sensor ${sensorMessage.sensorId}`,
        );
      }

      if (result.requiresAlert) {
        response.alert = {
          triggered: true,
          reason: result.alertReason,
        };
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Erro ao processar dados HTTP do sensor ${sensorMessage.sensorId}:`,
        error,
      );

      return {
        sensorId: sensorMessage.sensorId,
        received: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async processBatchSensorData(messages: SensorMessageDto[]): Promise<any> {
    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 100
    ) {
      throw new BadRequestException({ code: 'batchLimitExceeded', max: 100 });
    }

    this.logger.log(
      `Processando lote de ${messages.length} mensagens via HTTP`,
    );

    const results = await this.messageProcessor.processBatchMessages(messages);

    const response = {
      batchId: this.generateRequestId(),
      totalMessages: messages.length,
      processedMessages: results.filter((r) => r.isValid).length,
      failedMessages: results.filter((r) => !r.isValid).length,
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

    this.logger.log(
      `Lote processado: ${response.processedMessages} sucesso, ${response.failedMessages} falhas`,
    );

    return response;
  }

  async sendCommandToSensor(
    command: SensorCommandDto,
  ): Promise<SensorCommandResponseDto> {
    try {
      this.logger.log(
        `Enviando comando ${command.command} para sensor ${command.sensorId}`,
      );

      // Validar comando
      this.validateCommand(command);

      // Aqui seria implementada a lógica para enviar comando via MQTT ou outro protocolo
      // Por enquanto, simulamos uma resposta imediata
      const response: SensorCommandResponseDto = {
        sensorId: command.sensorId,
        requestId: command.requestId || this.generateRequestId(),
        status: 'PENDING',
        message: `Comando ${command.command} enviado para processamento`,
        timestamp: new Date().toISOString(),
        data: {
          estimatedCompletionTime: new Date(Date.now() + 30000).toISOString(), // 30 segundos
        },
      };

      // Armazenar request para acompanhamento
      this.activeRequests.set(response.requestId, {
        timestamp: new Date(),
        data: command,
      });

      return response;
    } catch (error) {
      this.logger.error(
        `Erro ao enviar comando para sensor ${command.sensorId}:`,
        error,
      );

      return {
        sensorId: command.sensorId,
        requestId: command.requestId || this.generateRequestId(),
        status: 'FAILED',
        message: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getCommandStatus(requestId: string): Promise<any> {
    const request = this.activeRequests.get(requestId);

    if (!request) {
      throw new BadRequestException({ code: 'commandRequestNotFound', requestId });
    }

    // Simular status baseado no tempo decorrido
    const elapsed = Date.now() - request.timestamp.getTime();
    let status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' = 'PENDING';

    if (elapsed > 60000) {
      // 1 minuto
      status = 'TIMEOUT';
    } else if (elapsed > 10000) {
      // 10 segundos
      status = Math.random() > 0.1 ? 'SUCCESS' : 'FAILED'; // 90% de sucesso
    }

    const response = {
      requestId,
      status,
      timestamp: new Date().toISOString(),
    };

    if (status === 'SUCCESS') {
      response['result'] = {
        command: request.data.command,
        executedAt: new Date(request.timestamp.getTime() + 10000).toISOString(),
        executionTime: 10000,
      };
      this.activeRequests.delete(requestId);
    } else if (status === 'FAILED') {
      response['error'] = 'Command execution failed';
      this.activeRequests.delete(requestId);
    } else if (status === 'TIMEOUT') {
      response['error'] = 'Command execution timed out';
      this.activeRequests.delete(requestId);
    }

    return response;
  }

  async getSensorStatus(sensorId: string): Promise<any> {
    // Simular status do sensor (em produção, consultar banco de dados)
    const status = {
      sensorId,
      connected: Math.random() > 0.2, // 80% online
      lastSeen: new Date(Date.now() - Math.random() * 3600000).toISOString(), // Última hora
      batteryLevel: Math.floor(Math.random() * 100),
      signalStrength: Math.floor(Math.random() * 40) - 100, // -100 a -60 dBm
      firmwareVersion: '1.2.3',
      timestamp: new Date().toISOString(),
    };

    return status;
  }

  async processHeartbeat(heartbeat: HeartbeatDto): Promise<unknown> {
    return this.messageProcessor.processHeartbeat(heartbeat);
  }

  private validateCommand(command: SensorCommandDto): void {
    const validCommands = [
      'CALIBRATE',
      'RESET',
      'UPDATE_CONFIG',
      'DIAGNOSTIC',
      'SHUTDOWN',
    ];

    if (!validCommands.includes(command.command)) {
      throw new BadRequestException({ code: 'invalidCommand', command: command.command });
    }

    if (command.command === 'UPDATE_CONFIG' && !command.parameters) {
      throw new BadRequestException({ code: 'updateConfigNeedsParameters' });
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanupOldRequests(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.activeRequests.forEach((request, requestId) => {
      if (now - request.timestamp.getTime() > this.maxRequestAge) {
        toDelete.push(requestId);
      }
    });

    toDelete.forEach((requestId) => {
      this.activeRequests.delete(requestId);
    });

    if (toDelete.length > 0) {
      this.logger.debug(`Limpos ${toDelete.length} requests antigos`);
    }
  }

  // Método para obter estatísticas do serviço HTTP
  getStats(): any {
    return {
      activeRequests: this.activeRequests.size,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  // Método para simulação de dados HTTP (para testes)
  async simulateHttpData(sensorId: string, level: number): Promise<any> {
    const simulatedMessage: SensorMessageDto = {
      sensorId,
      level,
      batteryLevel: Math.random() * 100,
      timestamp: new Date().toISOString(),
      metadata: {
        signalStrength: -Math.random() * 80 - 20,
        temperature: 20 + Math.random() * 10,
      },
    };

    return this.processSensorData(simulatedMessage);
  }
}
