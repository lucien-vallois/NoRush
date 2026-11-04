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
    const mqtt = this.gateway.getStats().mqtt.connected;
    return {
      status: database && mqtt ? 'ok' : 'degraded',
      service: 'norush-api',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      components: {
        api: 'up',
        database: database ? 'up' : 'down',
        mqtt: mqtt ? 'up' : 'down',
      },
    };
  }
}
