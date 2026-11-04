import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  IsNotEmpty,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Dimensões em metros; volume nominal em litros (calculado se omitido). */
export class TankDimensionsDto {
  @ApiProperty({ description: 'Altura interna (m)', example: 6.1 })
  @IsNumber()
  @Min(0.1)
  @Max(40)
  height: number;

  @ApiProperty({ description: 'Diâmetro interno (m)', example: 3.66 })
  @IsNumber()
  @Min(0.1)
  @Max(40)
  diameter: number;

  @ApiPropertyOptional({
    description: 'Volume nominal (L). Se omitido: último ponto da tabela de arqueação ou cilindro vertical.',
    example: 64000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volume?: number;
}

/** Ponto da tabela de arqueação (gauge chart): nível em m, volume em L. */
export class TankArqueacaoDto {
  @ApiProperty({ example: 1.0 })
  @IsNumber()
  @Min(0)
  level: number;

  @ApiProperty({ example: 10520 })
  @IsNumber()
  @Min(0)
  volume: number;
}

export class CreateTankDto {
  @ApiProperty({
    description: 'Código único do tanque',
    example: 'TNK-001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  code: string;

  @ApiProperty({
    description: 'Nome do tanque',
    example: 'Tanque Principal A',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    description: 'Descrição do tanque',
    example: 'Tanque de flowback localizado na plataforma norte',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ description: 'Dimensões do tanque', type: TankDimensionsDto })
  @ValidateNested()
  @Type(() => TankDimensionsDto)
  dimensions: TankDimensionsDto;

  @ApiPropertyOptional({
    description:
      'Tabela de arqueação (gauge chart) para conversão nível → volume, em m e L, nível crescente',
    type: [TankArqueacaoDto],
    example: [
      { level: 0.0, volume: 0 },
      { level: 1.0, volume: 7068 },
      { level: 2.0, volume: 14137 },
      { level: 3.0, volume: 21206 },
      { level: 4.0, volume: 28275 },
      { level: 5.0, volume: 35344 },
    ],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TankArqueacaoDto)
  arqueacaoTable?: TankArqueacaoDto[];

  @ApiProperty({
    description: 'Latitude da localização do tanque',
    example: -22.9068,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Longitude da localização do tanque',
    example: -43.1729,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Limite máximo de nível (metros)',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxLevelThreshold?: number;

  @ApiPropertyOptional({
    description: 'Limite mínimo de nível (metros)',
    example: 0.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minLevelThreshold?: number;

  @ApiPropertyOptional({
    description: 'Limite de transbordo (metros)',
    example: 4.8,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  overflowThreshold?: number;

  @ApiPropertyOptional({
    description: 'Limite de nível baixo (metros)',
    example: 0.2,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  lowLevelThreshold?: number;

  @ApiPropertyOptional({
    description: 'Data de instalação do tanque',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsDateString()
  installationDate?: string;

  @ApiPropertyOptional({
    description: 'Data da última manutenção',
    example: '2024-08-01',
  })
  @IsOptional()
  @IsDateString()
  lastMaintenanceDate?: string;

  @ApiPropertyOptional({
    description: 'Data da próxima manutenção',
    example: '2024-11-01',
  })
  @IsOptional()
  @IsDateString()
  nextMaintenanceDate?: string;
}
