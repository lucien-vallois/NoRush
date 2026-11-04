import { ConfigService } from '@nestjs/config';

export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  clientId: string;
  protocol: 'mqtt' | 'mqtts';
  rejectUnauthorized: boolean;
  topics: {
    sensorData: string;
    alerts: string;
    commands: string;
  };
  qos: 0 | 1 | 2;
  retain: boolean;
  reconnectPeriod: number;
  connectTimeout: number;
}

export const mqttConfig = (configService: ConfigService): MqttConfig => ({
  host: configService.get<string>('MQTT_HOST', 'localhost'),
  port: Number(configService.get('MQTT_PORT', 1883)),
  username: configService.get<string>('MQTT_USER'),
  password: configService.get<string>('MQTT_PASS'),
  clientId: `flowback-backend-${Date.now()}`,
  protocol: configService.get<string>('MQTT_PROTOCOL', 'mqtt') as 'mqtt' | 'mqtts',
  // mqtts (8883) valida o certificado do broker por padrão; aceitar
  // self-signed (false) é decisão explícita do bring-up local, via env.
  rejectUnauthorized:
    configService.get<string>('MQTT_REJECT_UNAUTHORIZED', 'true') === 'true',
  topics: {
    sensorData: configService.get<string>('MQTT_TOPIC_SENSOR_DATA', 'sensors/data'),
    alerts: configService.get<string>('MQTT_TOPIC_ALERTS', 'alerts'),
    commands: configService.get<string>('MQTT_TOPIC_COMMANDS', 'commands'),
  },
  // Number()/=== 'true': variáveis do .env chegam como string e mqtt.js exige qos numérico
  qos: Number(configService.get('MQTT_QOS', 1)) as 0 | 1 | 2,
  retain: configService.get('MQTT_RETAIN', 'false') === 'true',
  reconnectPeriod: Number(configService.get('MQTT_RECONNECT_PERIOD', 5000)),
  connectTimeout: Number(configService.get('MQTT_CONNECT_TIMEOUT', 30000)),
});
