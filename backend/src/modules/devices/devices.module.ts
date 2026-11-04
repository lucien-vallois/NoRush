import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sensor } from '../../entities/sensor.entity';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { DeviceCredentialsService } from './device-credentials.service';

@Module({
  imports: [TypeOrmModule.forFeature([Sensor])],
  controllers: [DevicesController],
  providers: [DevicesService, DeviceCredentialsService],
  exports: [DevicesService, DeviceCredentialsService],
})
export class DevicesModule {}
