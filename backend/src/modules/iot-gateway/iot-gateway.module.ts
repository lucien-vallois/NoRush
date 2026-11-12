import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Entities
import { Sensor } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { Tank } from '../../entities/tank.entity';

// Modules
import { TanksModule } from '../tanks/tanks.module';
import { AlertsModule } from '../alerts/alerts.module';
import { DevicesModule } from '../devices/devices.module';

// Services
import { IotGatewayService } from './iot-gateway.service';
import { MqttService } from './mqtt.service';
import { HttpService } from './http.service';
import { MessageProcessorService } from './message-processor.service';
import { DeviceCommandsService } from './device-commands.service';

// Controllers
import { IotGatewayController } from './iot-gateway.controller';

// Guards
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';

@Module({
  imports: [
    ConfigModule,
    TanksModule,
    AlertsModule,
    DevicesModule,
    TypeOrmModule.forFeature([Sensor, Reading, Tank]),
    // RabbitMQ Client
    ClientsModule.registerAsync([
      {
        name: 'RABBITMQ_SERVICE',
        imports: [ConfigModule],
        useFactory: async (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              `amqp://${configService.get('RABBITMQ_USER', 'guest')}:${configService.get('RABBITMQ_PASS', 'guest')}@${configService.get('RABBITMQ_HOST', 'localhost')}:${configService.get('RABBITMQ_PORT', 5672)}/${configService.get('RABBITMQ_VHOST', '')}`,
            ],
            queue: 'sensor_data_queue',
            queueOptions: {
              durable: true,
            },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  controllers: [IotGatewayController],
  providers: [
    IotGatewayService,
    MqttService,
    HttpService,
    MessageProcessorService,
    DeviceCommandsService,
    DevOnlyGuard,
  ],
  exports: [IotGatewayService, MessageProcessorService],
})
export class IotGatewayModule {}
