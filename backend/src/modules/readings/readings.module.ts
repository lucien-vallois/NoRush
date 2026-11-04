import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Reading } from '../../entities/reading.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Tank } from '../../entities/tank.entity';

// Services
import { ReadingsService } from './readings.service';

// Controllers
import { ReadingsController } from './readings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reading, Sensor, Tank]),
  ],
  controllers: [ReadingsController],
  providers: [ReadingsService],
  exports: [ReadingsService],
})
export class ReadingsModule {}
