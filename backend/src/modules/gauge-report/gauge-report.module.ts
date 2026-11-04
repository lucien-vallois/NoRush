import { Module } from '@nestjs/common';
import { GaugeReportController } from './gauge-report.controller';
import { GaugeReportService } from './gauge-report.service';

/** Daily (24 h) and 12-hour shift gauge reports built from the continuous level gauges. */
@Module({
  controllers: [GaugeReportController],
  providers: [GaugeReportService],
  exports: [GaugeReportService],
})
export class GaugeReportModule {}
