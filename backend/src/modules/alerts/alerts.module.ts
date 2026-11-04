import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { Alert } from '../../entities/alert.entity';
import { Tank } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { User } from '../../entities/user.entity';

// Services
import { AlertsService } from './alerts.service';
import { AlertProcessorService } from './alert-processor.service';
import { NotificationService } from './notification.service';

// Controllers
import { AlertsController } from './alerts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert, Tank, Sensor, Reading, User]),
    ScheduleModule,
  ],
  controllers: [AlertsController],
  providers: [
    AlertsService,
    AlertProcessorService,
    NotificationService,
  ],
  exports: [AlertsService, AlertProcessorService],
})
export class AlertsModule {}
