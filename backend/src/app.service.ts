import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { isDemoReadOnly } from './common/guards/demo-read-only.guard';
import { IotGatewayService } from './modules/iot-gateway/iot-gateway.service';

@Injectable()
export class AppService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly gateway: IotGatewayService,
    private readonly config: ConfigService,
  ) {}

  getHello(): string {
    return 'NoRush Operations API';
  }

  getMeta() {
    return {
      service: 'norush-api',
      version: process.env.npm_package_version ?? null,
      // The console shows a banner and the API refuses setup changes
      demoReadOnly: isDemoReadOnly(this.config),
    };
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
