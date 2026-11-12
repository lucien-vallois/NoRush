import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';
import { MqttConfig, mqttConfig } from '../../config/mqtt.config';
import { MessageProcessorService } from './message-processor.service';
import { SensorMessageDto } from './dto/sensor-message.dto';

export type CommandResponseHandler = (
  sensorId: string,
  response: unknown,
) => void;

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;
  private config: MqttConfig;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private isConnected = false;
  private messagesReceived = 0;
  private readonly enabled: boolean;
  private readonly commandResponseHandlers: CommandResponseHandler[] = [];

  constructor(
    private configService: ConfigService,
    private messageProcessor: MessageProcessorService,
  ) {
    this.config = mqttConfig(this.configService);
    // MQTT_ENABLED=false: HTTP-only deployments (e.g. a hosted demo without a
    // broker) skip the connection instead of retrying and logging forever.
    this.enabled =
      this.configService.get<string>('MQTT_ENABLED', 'true') !== 'false';
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.log('MQTT disabled (MQTT_ENABLED=false): HTTP ingestion only');
      return;
    }
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      const options: mqtt.IClientOptions = {
        host: this.config.host,
        port: this.config.port,
        protocol: this.config.protocol,
        username: this.config.username,
        password: this.config.password,
        clientId: this.config.clientId,
        clean: true,
        reconnectPeriod: this.config.reconnectPeriod,
        connectTimeout: this.config.connectTimeout,
        keepalive: 60,
        rejectUnauthorized: this.config.rejectUnauthorized,
        will: {
          topic: 'sensors/status',
          payload: JSON.stringify({
            clientId: this.config.clientId,
            status: 'offline',
            timestamp: new Date().toISOString(),
          }),
          qos: 1,
          retain: false,
        },
      };

      this.client = mqtt.connect(options);

      this.client.on('connect', () => {
        this.onConnect();
      });

      this.client.on('disconnect', () => {
        this.onDisconnect();
      });

      this.client.on('error', (error) => {
        this.onError(error);
      });

      this.client.on('message', (topic, message) => {
        void this.onMessage(topic, message);
      });

      this.client.on('reconnect', () => {
        this.onReconnect();
      });
    } catch (error) {
      this.logger.error('Erro ao conectar ao MQTT broker:', error);
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    if (this.isConnected) {
      this.logger.log('Desconectando do MQTT broker...');

      // Publicar status offline antes de desconectar
      await this.publishStatus('offline');

      this.isConnected = false;

      this.logger.log('Desconectado do MQTT broker');
    }

    // Encerra o cliente mesmo fora de conexão para interromper tentativas de reconexão
    this.client.end(true);
  }

  private onConnect(): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;

    this.logger.log(
      `Conectado ao MQTT broker: ${this.config.host}:${this.config.port}`,
    );

    // Inscrever-se nos tópicos
    this.subscribeToTopics();

    // Publicar status online
    this.publishStatus('online');
  }

  private onDisconnect(): void {
    this.isConnected = false;
    this.logger.warn('Desconectado do MQTT broker');
  }

  private onError(error: Error): void {
    this.logger.error('Erro na conexão MQTT:', error);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(
        `Máximo de tentativas de reconexão atingido (${this.maxReconnectAttempts})`,
      );
    }
  }

  private onReconnect(): void {
    this.reconnectAttempts++;
    this.logger.log(
      `Tentando reconectar ao MQTT broker (tentativa ${this.reconnectAttempts})`,
    );
  }

  private subscribeToTopics(): void {
    const topics = [
      this.config.topics.sensorData,
      'sensors/+/data', // Wildcard para dados específicos de sensor
      'sensors/+/status', // Status dos sensores
      'sensors/commands/+', // Respostas de comandos
      // Contrato por dispositivo (docs/hardware-integration.md): cada boia
      // publica apenas no próprio tópico; binding tópico↔sensorId é validado.
      'devices/+/telemetry',
      'devices/+/status',
      'devices/+/commands/responses',
    ];

    topics.forEach((topic) => {
      this.client.subscribe(topic, { qos: this.config.qos }, (err) => {
        if (err) {
          this.logger.error(`Erro ao se inscrever no tópico ${topic}:`, err);
        } else {
          this.logger.log(`Inscrito no tópico: ${topic}`);
        }
      });
    });
  }

  /** Extrai o sensorId de tópicos devices/{sensorId}/... */
  private deviceTopicId(topic: string): string | null {
    const match = topic.match(/^devices\/([A-Za-z0-9_-]+)\//);
    return match ? match[1] : null;
  }

  private async onMessage(topic: string, message: Buffer): Promise<void> {
    this.messagesReceived++;
    try {
      const messageStr = message.toString();

      this.logger.debug(`Mensagem recebida no tópico ${topic}`);

      // Parse da mensagem
      const data = JSON.parse(messageStr);

      // Identificar tipo de mensagem baseado no tópico
      if (topic.startsWith('devices/')) {
        await this.handleDeviceTopic(topic, data);
      } else if (
        topic === this.config.topics.sensorData ||
        topic.includes('/data')
      ) {
        await this.handleSensorData(data);
      } else if (topic.includes('/status')) {
        await this.handleSensorStatus(data);
      } else if (topic.includes('/commands/')) {
        this.handleCommandResponse(data?.sensorId, data);
      } else {
        this.logger.warn(`Tópico não reconhecido: ${topic}`);
      }
    } catch (error) {
      this.logger.error(
        `Erro ao processar mensagem do tópico ${topic}:`,
        error,
      );
    }
  }

  private async handleDeviceTopic(
    topic: string,
    data: any,
  ): Promise<void> {
    const topicSensorId = this.deviceTopicId(topic);
    if (!topicSensorId) {
      this.logger.warn(`Tópico de dispositivo malformado: ${topic}`);
      return;
    }

    // Binding tópico↔payload: dispositivo só pode publicar como ele mesmo.
    if (data.sensorId && data.sensorId !== topicSensorId) {
      this.logger.warn(
        `Binding violado em ${topic}: payload declara sensorId=${data.sensorId}`,
      );
      return;
    }
    data.sensorId = topicSensorId;

    if (topic.endsWith('/telemetry')) {
      await this.handleSensorData(data);
    } else if (topic.endsWith('/status')) {
      await this.handleSensorStatus(data);
    } else if (topic.endsWith('/commands/responses')) {
      this.handleCommandResponse(topicSensorId, data);
    } else {
      this.logger.warn(`Tópico de dispositivo não reconhecido: ${topic}`);
    }
  }

  private async handleSensorData(data: any): Promise<void> {
    try {
      // Validar estrutura básica
      if (!data.sensorId || typeof data.level !== 'number') {
        this.logger.warn('Mensagem de sensor inválida:', data);
        return;
      }

      // Converter para DTO
      const sensorMessage: SensorMessageDto = {
        sensorId: data.sensorId,
        level: data.level,
        oilWaterInterface: data.oilWaterInterface,
        batteryLevel: data.batteryLevel,
        metadata: data.metadata,
        timestamp: data.timestamp || new Date().toISOString(),
        version: data.version,
        authToken: data.authToken,
      };

      // Processar mensagem
      const result =
        await this.messageProcessor.processSensorMessage(sensorMessage);

      if (!result.isValid) {
        this.logger.warn(
          `Mensagem inválida do sensor ${sensorMessage.sensorId}:`,
          result.validationErrors,
        );
        return;
      }

      this.logger.debug(
        `Dados do sensor ${sensorMessage.sensorId} processados com sucesso`,
      );

      // Publicar confirmação se necessário
      if (data.requestId) {
        await this.publish(`sensors/${sensorMessage.sensorId}/ack`, {
          requestId: data.requestId,
          status: 'received',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      this.logger.error('Erro ao processar dados do sensor:', error);
    }
  }

  private async handleSensorStatus(data: any): Promise<void> {
    // Heartbeat de dispositivo (sinal de vida sem leitura de nível)
    if (data?.sensorId) {
      const result = await this.messageProcessor.processHeartbeat({
        sensorId: data.sensorId,
        authToken: data.authToken,
        batteryLevel: data.batteryLevel,
        firmwareVersion: data.firmwareVersion ?? data.version,
        signalStrength: data.signalStrength ?? data.metadata?.signalStrength,
        timestamp: data.timestamp,
      });
      if (!result.received) {
        this.logger.debug(
          `Heartbeat não aceito para ${data.sensorId}: ${result.reason}`,
        );
      }
      return;
    }
    this.logger.debug('Status do sensor recebido:', data);
  }

  /** Registers a listener for device answers to commands (DeviceCommandsService). */
  onCommandResponse(handler: CommandResponseHandler): void {
    this.commandResponseHandlers.push(handler);
  }

  private handleCommandResponse(sensorId: unknown, data: unknown): void {
    if (typeof sensorId !== 'string') {
      this.logger.warn('Command response without a sensorId ignored');
      return;
    }
    this.logger.debug(`Command response from ${sensorId}`);
    for (const handler of this.commandResponseHandlers) {
      handler(sensorId, data);
    }
  }

  // Método público para publicar mensagens
  async publish(
    topic: string,
    message: any,
    options?: { qos?: number; retain?: boolean },
  ): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Cliente MQTT não conectado. Mensagem não enviada.');
      return;
    }

    try {
      const payload = JSON.stringify(message);
      const publishOptions = {
        qos: (options?.qos as 0 | 1 | 2) || this.config.qos,
        retain: options?.retain || this.config.retain,
      };

      this.client.publish(topic, payload, publishOptions, (err) => {
        if (err) {
          this.logger.error(`Erro ao publicar no tópico ${topic}:`, err);
        } else {
          this.logger.debug(`Mensagem publicada no tópico ${topic}`);
        }
      });
    } catch (error) {
      this.logger.error(`Erro ao publicar mensagem no tópico ${topic}:`, error);
    }
  }

  private async publishStatus(status: 'online' | 'offline'): Promise<void> {
    await this.publish('sensors/gateway/status', {
      clientId: this.config.clientId,
      status,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    });
  }

  // Comando no contrato por dispositivo: devices/{sensorId}/commands.
  // A boia escuta o próprio tópico e responde em devices/{sensorId}/commands/responses.
  async sendDeviceCommand(sensorId: string, command: any): Promise<void> {
    const topic = `devices/${sensorId}/commands`;
    await this.publish(topic, {
      ...command,
      timestamp: new Date().toISOString(),
      from: this.config.clientId,
    });
  }

  getConnectionStatus(): {
    enabled: boolean;
    connected: boolean;
    reconnectAttempts: number;
    messagesReceived: number;
  } {
    return {
      enabled: this.enabled,
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      messagesReceived: this.messagesReceived,
    };
  }

  /** Drops the broker connection and connects again right away. */
  reconnect(): boolean {
    if (!this.enabled || !this.client) return false;
    this.logger.log('Reconnecting to the MQTT broker on request');
    this.client.reconnect();
    return true;
  }

  // Método para simulação de dados (para testes)
  async simulateSensorData(sensorId: string, level: number): Promise<void> {
    const simulatedData = {
      sensorId,
      level,
      batteryLevel: Math.random() * 100,
      timestamp: new Date().toISOString(),
      metadata: {
        signalStrength: -Math.random() * 80 - 20,
        temperature: 20 + Math.random() * 10,
      },
    };

    await this.publish(this.config.topics.sensorData, simulatedData);
    this.logger.log(`Dados simulados enviados para sensor ${sensorId}`);
  }
}
