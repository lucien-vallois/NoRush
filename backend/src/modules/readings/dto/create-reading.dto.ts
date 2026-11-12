import {
  IsUUID,
  IsNumber,
  IsOptional,
  Min,
  Max,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  OilWaterInterfaceDto,
  SensorMetadataDto,
} from '../../iot-gateway/dto/sensor-message.dto';

export class CreateReadingDto {
  @ApiProperty({
    description: 'ID do sensor que fez a leitura',
  })
  @IsUUID()
  sensorId: string;

  @ApiProperty({
    description: 'Nível medido em metros',
    example: 3.45,
  })
  @IsNumber()
  @Min(0)
  level: number;

  @ApiPropertyOptional({
    description: 'Volume calculado em litros',
    example: 2450.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  volume?: number;

  @ApiPropertyOptional({
    description: 'Interface óleo-água (se aplicável)',
  })
  @IsOptional()
  @Type(() => OilWaterInterfaceDto)
  oilWaterInterface?: OilWaterInterfaceDto;

  @ApiPropertyOptional({
    description: 'Metadados da medição',
  })
  @IsOptional()
  @Type(() => SensorMetadataDto)
  metadata?: SensorMetadataDto;

  @ApiPropertyOptional({
    description: 'Qualidade da medição (0-100%)',
    example: 95,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  quality?: number;

  @ApiPropertyOptional({
    description: 'Leitura foi calibrada',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isCalibrated?: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp da leitura',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}
