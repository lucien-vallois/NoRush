import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IotGatewayService } from './modules/iot-gateway/iot-gateway.service';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: IotGatewayService,
  ) {}

  getHello(): string {
    return 'NoRush Operations API';
  }

  async getHealth() {
    let database = false;
    try {
      await this.dataSource.query('SELECT 1');
      database = true;
    } catch {
      /* Expose availability, never connection details. */
    }
    const { enabled, connected } = this.gateway.getStats().mqtt;
    // MQTT_ENABLED=false (HTTP-only deployment) is a choice, not an outage.
    const mqtt = !enabled ? 'disabled' : connected ? 'up' : 'down';
    return {
      status: database && mqtt !== 'down' ? 'ok' : 'degraded',
      service: 'norush-api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      components: {
        api: 'up',
        database: database ? 'up' : 'down',
        mqtt,
      },
    };
  }
}
