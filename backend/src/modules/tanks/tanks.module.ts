import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Tank } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Alert } from '../../entities/alert.entity';

// Services
import { TanksService } from './tanks.service';

// Controllers
import { TanksController } from './tanks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tank, Sensor, Alert]),
  ],
  controllers: [TanksController],
  providers: [TanksService],
  exports: [TanksService],
})
export class TanksModule {}
