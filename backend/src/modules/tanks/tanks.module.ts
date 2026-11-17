import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Tank } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Alert } from '../../entities/alert.entity';

// Services
import { TanksService } from './tanks.service';
import { TankOperationalStateService } from './tank-operational-state.service';
import { PredictionsModule } from '../predictions/predictions.module';

// Controllers
import { TanksController } from './tanks.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tank, Sensor, Alert]), PredictionsModule],
  controllers: [TanksController],
  providers: [TanksService, TankOperationalStateService],
  exports: [TanksService, TankOperationalStateService],
})
export class TanksModule {}
