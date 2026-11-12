import {
  IsEnum,
  IsOptional,
  IsUUID,
  IsDateString,
  IsArray,
  IsString,
} from 'class-validator';
import { OmitType, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ReportType {
  TANK_LEVEL_HISTORY = 'tank_level_history',
  SENSOR_PERFORMANCE = 'sensor_performance',
  ALERT_SUMMARY = 'alert_summary',
  SYSTEM_OVERVIEW = 'system_overview',
  MAINTENANCE_SCHEDULE = 'maintenance_schedule',
  PRODUCTION_ANALYSIS = 'production_analysis',
}

export enum ReportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
  CSV = 'csv',
}

export class GenerateReportDto {
  @ApiProperty({
    description: 'Tipo do relatório',
    enum: ReportType,
    example: ReportType.TANK_LEVEL_HISTORY,
  })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiProperty({
    description: 'Formato do relatório',
    enum: ReportFormat,
    example: ReportFormat.PDF,
  })
  @IsEnum(ReportFormat)
  format: ReportFormat;

  @ApiPropertyOptional({
    description: 'Data inicial para o relatório',
    example: '2024-01-01T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data final para o relatório',
    example: '2024-01-31T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'IDs dos tanques (opcional)',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  tankIds?: string[];

  @ApiPropertyOptional({
    description: 'IDs dos sensores (opcional)',
    example: ['550e8400-e29b-41d4-a716-446655440001'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  sensorIds?: string[];

  @ApiPropertyOptional({
    description: 'Parâmetros adicionais do relatório',
    example: {
      includeCharts: true,
      groupBy: 'hour',
      threshold: 4.5,
    },
  })
  @IsOptional()
  parameters?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Título personalizado do relatório',
    example: 'Relatório de Níveis - Janeiro 2024',
  })
  @IsOptional()
  @IsString()
  title?: string;
}

/**
 * Body of the per-type shortcuts (POST /reports/alert-summary, ...): the
 * same fields and validation as /reports/generate, with the type implied by
 * the route.
 */
export class ReportShortcutDto extends OmitType(GenerateReportDto, [
  'type',
] as const) {}
