import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import {
  ReportType,
  ReportFormat,
  GenerateReportDto,
} from './dto/generate-report.dto';
import { ReportDataService } from './services/report-data.service';
import { PdfReportService } from './services/pdf-report.service';
import { ExcelReportService } from './services/excel-report.service';
import { csvRow } from '../../common/csv';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);
  private readonly startedAt = new Date().toISOString();
  private readonly usage = {
    total: 0,
    byType: {} as Record<string, number>,
    byFormat: {} as Record<string, number>,
    totalMs: 0,
    last: null as string | null,
  };

  constructor(
    private reportDataService: ReportDataService,
    private pdfReportService: PdfReportService,
    private excelReportService: ExcelReportService,
  ) {}

  async generateReport(dto: GenerateReportDto): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const startedAt = Date.now();
    try {
      // Validar parâmetros
      this.validateReportParameters(dto);

      // Obter dados do relatório
      const reportData = await this.reportDataService.generateReportData(
        dto.type,
        {
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          tankIds: dto.tankIds,
          sensorIds: dto.sensorIds,
          parameters: dto.parameters,
        },
        dto.title,
      );

      // Gerar relatório no formato solicitado
      let buffer: Buffer;
      let filename: string;
      let contentType: string;

      switch (dto.format) {
        case ReportFormat.PDF:
          buffer = await this.pdfReportService.generatePdf(
            dto.type,
            reportData,
          );
          filename = this.generateFilename(dto.type, 'pdf', dto.title);
          contentType = 'application/pdf';
          break;

        case ReportFormat.EXCEL:
          buffer = await this.excelReportService.generateExcel(
            dto.type,
            reportData,
          );
          filename = this.generateFilename(dto.type, 'xlsx', dto.title);
          contentType =
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          break;

        case ReportFormat.CSV:
          buffer = this.generateCsvReport(reportData);
          filename = this.generateFilename(dto.type, 'csv', dto.title);
          contentType = 'text/csv';
          break;

        default:
          throw new BadRequestException({
            code: 'unsupportedReportFormat',
            format: dto.format,
          });
      }

      this.recordUsage(dto.type, dto.format, Date.now() - startedAt);
      this.logger.log(`Report generated: ${filename} (${buffer.length} bytes)`);

      return {
        buffer,
        filename,
        contentType,
      };
    } catch (error) {
      this.logger.error(`Erro ao gerar relatório ${dto.type}:`, error);
      throw error;
    }
  }

  async getReportPreview(type: ReportType, filters?: any): Promise<any> {
    try {
      const reportData = await this.reportDataService.generateReportData(
        type,
        filters,
      );

      return {
        metadata: reportData.metadata,
        summary: reportData.summary,
        dataCount: Array.isArray(reportData.data) ? reportData.data.length : 1,
        availableFormats: this.getAvailableReports().find(
          (report) => report.type === type,
        )?.formats ?? ['excel'],
      };
    } catch (error) {
      this.logger.error(`Erro ao gerar preview do relatório ${type}:`, error);
      throw error;
    }
  }

  /**
   * Report catalog. Every type exports to Excel; PDF is listed only for the
   * types that have a layout (templates/*.hbs), so the catalog never offers
   * a format that would fail.
   */
  getAvailableReports() {
    const catalog = [
      {
        type: ReportType.TANK_LEVEL_HISTORY,
        title: 'Tank level history',
        description: 'Levels of every tank over the selected period',
        formats: ['pdf', 'excel', 'csv'],
        parameters: {
          startDate: 'required',
          endDate: 'required',
          tankIds: 'optional',
        },
      },
      {
        type: ReportType.SENSOR_PERFORMANCE,
        title: 'Gauge performance',
        description: 'Reading quality, transmissions and status of every gauge',
        formats: ['pdf', 'excel', 'csv'],
        parameters: {
          startDate: 'required',
          endDate: 'required',
          sensorIds: 'optional',
        },
      },
      {
        type: ReportType.ALERT_SUMMARY,
        title: 'Alert summary',
        description:
          'Every alert raised in the period, with acknowledgment and resolution',
        formats: ['pdf', 'excel', 'csv'],
        parameters: {
          startDate: 'required',
          endDate: 'required',
          tankIds: 'optional',
          sensorIds: 'optional',
        },
      },
      {
        type: ReportType.SYSTEM_OVERVIEW,
        title: 'System overview',
        description: 'Overall status of tanks and gauges',
        formats: ['pdf', 'excel'],
        parameters: { startDate: 'optional', endDate: 'optional' },
      },
      {
        type: ReportType.MAINTENANCE_SCHEDULE,
        title: 'Maintenance schedule',
        description: 'Tanks and gauges due for maintenance or calibration',
        formats: ['pdf', 'excel', 'csv'],
        parameters: {},
      },
      {
        type: ReportType.PRODUCTION_ANALYSIS,
        title: 'Production analysis',
        description: 'Production estimated from tank volumes',
        formats: ['pdf', 'excel', 'csv'],
        parameters: {
          startDate: 'required',
          endDate: 'required',
          tankIds: 'optional',
        },
      },
    ];
    return catalog.map((report) => ({
      ...report,
      formats: report.formats.filter(
        (format) =>
          format !== 'pdf' || this.pdfReportService.hasLayout(report.type),
      ),
    }));
  }

  private validateReportParameters(dto: GenerateReportDto): void {
    // Validar período
    if (dto.startDate && dto.endDate) {
      const start = new Date(dto.startDate);
      const end = new Date(dto.endDate);

      if (start > end) {
        throw new BadRequestException({ code: 'startAfterEnd' });
      }

      // Limitar período máximo (90 dias para relatórios detalhados)
      const maxPeriodDays = 90;
      const periodDays =
        (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);

      if (periodDays > maxPeriodDays) {
        throw new BadRequestException({
          code: 'reportPeriodTooLong',
          days: maxPeriodDays,
        });
      }
    }

    // Validar limites de dados
    if (dto.tankIds && dto.tankIds.length > 50) {
      throw new BadRequestException({ code: 'reportTankLimit', max: 50 });
    }

    if (dto.sensorIds && dto.sensorIds.length > 100) {
      throw new BadRequestException({ code: 'reportSensorLimit', max: 100 });
    }

    // Validações específicas por tipo
    switch (dto.type) {
      case ReportType.TANK_LEVEL_HISTORY:
      case ReportType.SENSOR_PERFORMANCE:
      case ReportType.ALERT_SUMMARY:
      case ReportType.PRODUCTION_ANALYSIS:
        if (!dto.startDate || !dto.endDate) {
          throw new BadRequestException({ code: 'reportPeriodRequired' });
        }
        break;
    }
  }

  private generateFilename(
    type: ReportType,
    extension: string,
    customTitle?: string,
  ): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const baseName = customTitle || this.getTypeName(type);
    const sanitizedName = baseName
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '_');

    return `${sanitizedName}_${timestamp}.${extension}`;
  }

  private getTypeName(type: ReportType): string {
    const names = {
      [ReportType.TANK_LEVEL_HISTORY]: 'Historico_Niveis_Tanques',
      [ReportType.SENSOR_PERFORMANCE]: 'Performance_Sensores',
      [ReportType.ALERT_SUMMARY]: 'Resumo_Alertas',
      [ReportType.SYSTEM_OVERVIEW]: 'Visao_Geral_Sistema',
      [ReportType.MAINTENANCE_SCHEDULE]: 'Cronograma_Manutencao',
      [ReportType.PRODUCTION_ANALYSIS]: 'Analise_Producao',
    };
    return names[type] || 'Relatorio';
  }

  private generateCsvReport(data: {
    summary?: Record<string, unknown>;
    data?: unknown;
  }): Buffer {
    const lines: string[] = [];

    if (data.summary) {
      lines.push(csvRow(['field', 'value']));
      for (const [key, value] of Object.entries(data.summary)) {
        lines.push(csvRow([key, value]));
      }
      lines.push('');
    }

    if (Array.isArray(data.data) && data.data.length > 0) {
      const rows = data.data as Record<string, unknown>[];
      const headers = Object.keys(rows[0]);
      lines.push(csvRow(headers));
      for (const row of rows) lines.push(csvRow(headers.map((h) => row[h])));
    }

    return Buffer.from(lines.join('\n') + '\n', 'utf-8');
  }

  /** Reports generated since the API started (kept in memory). */
  getReportsStats() {
    const { total, byType, byFormat, totalMs, last } = this.usage;
    return {
      totalGenerated: total,
      byType,
      byFormat,
      averageGenerationTimeMs: total ? Math.round(totalMs / total) : null,
      lastGenerated: last,
      since: this.startedAt,
    };
  }

  private recordUsage(type: ReportType, format: ReportFormat, ms: number) {
    this.usage.total++;
    this.usage.byType[type] = (this.usage.byType[type] ?? 0) + 1;
    this.usage.byFormat[format] = (this.usage.byFormat[format] ?? 0) + 1;
    this.usage.totalMs += ms;
    this.usage.last = new Date().toISOString();
  }
}
