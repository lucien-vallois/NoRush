import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { buildGaugeReportCsv } from './gauge-report.csv';
import { GaugeReport, GaugeReportService } from './gauge-report.service';

const QUERY_DOCS = [
  {
    name: 'period',
    required: false,
    enum: ['daily', 'day', 'night'],
    description:
      'Gauge day (24 h), or its first (day) or last (night) 12 hours. Default: daily.',
  },
  {
    name: 'date',
    required: false,
    description:
      'Gauge day, YYYY-MM-DD: the local date it starts on. Default: the last completed period.',
  },
  {
    name: 'startHour',
    required: false,
    description:
      'Local hour the gauge day starts, 0-23. Default: GAUGE_DAY_START_HOUR or 7.',
  },
  {
    name: 'tz',
    required: false,
    description:
      'IANA time zone of the pad, e.g. America/Chicago. Default: GAUGE_DAY_TIMEZONE or UTC.',
  },
];

@ApiTags('Gauge reports')
@ApiBearerAuth()
@Controller('gauge-reports')
export class GaugeReportController {
  constructor(private readonly reports: GaugeReportService) {}

  @Get()
  @ApiOperation({
    summary:
      'Gauge report: opening and closing gauges, oil and water produced and removed per tank',
    description:
      'Built from the continuous level gauges. Levels in meters, volumes in liters. ' +
      'Removed = drops over 2 in of level; produced = closing - opening + removed.',
  })
  @ApiQuery(QUERY_DOCS[0])
  @ApiQuery(QUERY_DOCS[1])
  @ApiQuery(QUERY_DOCS[2])
  @ApiQuery(QUERY_DOCS[3])
  get(
    @Query('period') period?: string,
    @Query('date') date?: string,
    @Query('startHour') startHour?: string,
    @Query('tz') tz?: string,
  ): Promise<GaugeReport> {
    return this.reports.build({ period, date, startHour, tz });
  }

  @Get('csv')
  @ApiOperation({
    summary:
      'The same report as a CSV file, in imperial (ft-in, bbl) or metric (m, m3) units',
  })
  @ApiProduces('text/csv')
  @ApiQuery(QUERY_DOCS[0])
  @ApiQuery(QUERY_DOCS[1])
  @ApiQuery(QUERY_DOCS[2])
  @ApiQuery(QUERY_DOCS[3])
  @ApiQuery({
    name: 'units',
    required: false,
    enum: ['imperial', 'metric'],
    description: 'Default: imperial.',
  })
  async csv(
    @Res({ passthrough: true }) res: Response,
    @Query('period') period?: string,
    @Query('date') date?: string,
    @Query('startHour') startHour?: string,
    @Query('tz') tz?: string,
    @Query('units') units?: string,
  ): Promise<string> {
    const report = await this.reports.build({ period, date, startHour, tz });
    const unitSystem = units === 'metric' ? 'metric' : 'imperial';
    const file = `norush-gauge-report-${report.period.date}-${report.period.kind}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    return buildGaugeReportCsv(report, unitSystem);
  }
}
