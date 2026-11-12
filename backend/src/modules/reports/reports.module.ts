import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Entities
import { Tank } from '../../entities/tank.entity';
import { Sensor } from '../../entities/sensor.entity';
import { Reading } from '../../entities/reading.entity';
import { Alert } from '../../entities/alert.entity';

// Services
import { ReportsService } from './reports.service';
import { PdfReportService } from './services/pdf-report.service';
import { ExcelReportService } from './services/excel-report.service';
import { ReportDataService } from './services/report-data.service';

// Controllers
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Tank, Sensor, Reading, Alert])],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    PdfReportService,
    ExcelReportService,
    ReportDataService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
