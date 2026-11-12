import {
  IsOptional,
  IsString,
  IsEnum,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  SensorType,
  SensorProtocol,
  SensorStatus,
} from '../../../entities/sensor.entity';

export class SensorFiltersDto {
  @ApiPropertyOptional({
    description: 'Filtrar por tipo de sensor',
    enum: SensorType,
    example: SensorType.MAGNETOSTRICTIVE,
  })
  @IsOptional()
  @IsEnum(SensorType)
  type?: SensorType;

  @ApiPropertyOptional({
    description: 'Filtrar por protocolo',
    enum: SensorProtocol,
    example: SensorProtocol.MQTT,
  })
  @IsOptional()
  @IsEnum(SensorProtocol)
  protocol?: SensorProtocol;

  @ApiPropertyOptional({
    description: 'Filtrar por status',
    enum: SensorStatus,
    example: SensorStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SensorStatus)
  status?: SensorStatus;

  @ApiPropertyOptional({
    description: 'Filtrar por ID do tanque',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  tankId?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por modelo',
    example: 'RL-1000',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por fabricante',
    example: 'SensorTech Industries',
  })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({
    description: 'Buscar por nome ou ID do sensor',
    example: 'SENSOR-001',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Apenas sensores online',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  onlineOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Apenas sensores que precisam de calibração',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  needsCalibration?: boolean;

  @ApiPropertyOptional({
    description: 'Apenas sensores com bateria baixa',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  lowBattery?: boolean;
}
