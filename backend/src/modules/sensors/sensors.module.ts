import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Sensor } from '../../entities/sensor.entity';
import { Tank } from '../../entities/tank.entity';
import { Reading } from '../../entities/reading.entity';

// Services
import { SensorsService } from './sensors.service';

// Controllers
import { SensorsController } from './sensors.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sensor, Tank, Reading]),
  ],
  controllers: [SensorsController],
  providers: [SensorsService],
  exports: [SensorsService],
})
export class SensorsModule {}
