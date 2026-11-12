import {
  IsOptional,
  IsUUID,
  IsDateString,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Whitelist usada tanto na validação quanto na ordenação do serviço —
// o sortBy é interpolado no ORDER BY, então não pode aceitar valor livre.
export const READING_SORT_COLUMNS = [
  'timestamp',
  'level',
  'volume',
  'quality',
  'createdAt',
] as const;

export const READING_SORT_ORDERS = ['ASC', 'DESC'] as const;

export class ReadingFiltersDto {
  @ApiPropertyOptional({
    description: 'ID do sensor',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  sensorId?: string;

  @ApiPropertyOptional({
    description: 'ID do tanque',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsOptional()
  @IsUUID()
  tankId?: string;

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
    description: 'Nível mínimo',
    example: 1.0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevel?: number;

  @ApiPropertyOptional({
    description: 'Nível máximo',
    example: 4.0,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLevel?: number;

  @ApiPropertyOptional({
    description: 'Volume mínimo (litros)',
    example: 500,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  minVolume?: number;

  @ApiPropertyOptional({
    description: 'Volume máximo (litros)',
    example: 3000,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxVolume?: number;

  @ApiPropertyOptional({
    description: 'Qualidade mínima (0-100%)',
    example: 80,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  minQuality?: number;

  @ApiPropertyOptional({
    description: 'Apenas leituras calibradas',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  calibratedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Apenas leituras processadas',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  processedOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Limite de resultados',
    example: 100,
    default: 100,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Página (para paginação)',
    example: 1,
    default: 1,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Ordenação',
    example: 'timestamp',
    enum: READING_SORT_COLUMNS,
  })
  @IsOptional()
  @IsIn(READING_SORT_COLUMNS)
  sortBy?: (typeof READING_SORT_COLUMNS)[number] = 'timestamp';

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    example: 'DESC',
    enum: READING_SORT_ORDERS,
  })
  @IsOptional()
  @IsIn(READING_SORT_ORDERS)
  sortOrder?: (typeof READING_SORT_ORDERS)[number] = 'DESC';
}
