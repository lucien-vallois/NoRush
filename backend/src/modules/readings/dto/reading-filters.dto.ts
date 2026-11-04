import { IsOptional, IsUUID, IsDateString, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevel?: number;

  @ApiPropertyOptional({
    description: 'Nível máximo',
    example: 4.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLevel?: number;

  @ApiPropertyOptional({
    description: 'Volume mínimo (litros)',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minVolume?: number;

  @ApiPropertyOptional({
    description: 'Volume máximo (litros)',
    example: 3000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxVolume?: number;

  @ApiPropertyOptional({
    description: 'Qualidade mínima (0-100%)',
    example: 80,
  })
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
  @IsOptional()
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Ordenação',
    example: 'timestamp',
    enum: ['timestamp', 'level', 'volume', 'quality', 'createdAt'],
  })
  @IsOptional()
  sortBy?: 'timestamp' | 'level' | 'volume' | 'quality' | 'createdAt' = 'timestamp';

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    example: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
