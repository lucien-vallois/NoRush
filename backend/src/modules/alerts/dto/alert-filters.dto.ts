import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsDateString,
  IsBoolean,
  IsInt,
  Min,
  Max,
  IsIn,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { QueryBoolean } from '../../../common/transformers/query-boolean';
import {
  AlertType,
  AlertSeverity,
  AlertStatus,
} from '../../../entities/alert.entity';

export class AlertFiltersDto {
  @ApiPropertyOptional({
    description: 'Filtrar por tipo de alerta',
    enum: AlertType,
    example: AlertType.HIGH_LEVEL,
  })
  @IsOptional()
  @IsEnum(AlertType)
  type?: AlertType;

  @ApiPropertyOptional({
    description: 'Filtrar por severidade',
    enum: AlertSeverity,
    example: AlertSeverity.HIGH,
  })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional({
    description: 'Filtrar por status',
    enum: AlertStatus,
    example: AlertStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por ID do tanque',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  tankId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ID do sensor',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  sensorId?: string;

  @ApiPropertyOptional({
    description: 'Data inicial (ISO 8601)',
    example: '2024-01-15T00:00:00Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Data final (ISO 8601)',
    example: '2024-01-15T23:59:59Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Buscar por título ou mensagem',
    example: 'nível alto',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    description: 'Apenas alertas não reconhecidos',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @QueryBoolean()
  unacknowledgedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Apenas alertas críticos',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @QueryBoolean()
  criticalOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Limite de resultados',
    example: 50,
    default: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Página (para paginação)',
    example: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Ordenação',
    example: 'createdAt',
    enum: ['createdAt', 'severity', 'type', 'acknowledgedAt'],
  })
  @IsOptional()
  @IsIn(['createdAt', 'severity', 'type', 'acknowledgedAt'])
  sortBy?: 'createdAt' | 'severity' | 'type' | 'acknowledgedAt' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
