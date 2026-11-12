import {
  IsString,
  IsNumber,
  IsOptional,
  IsObject,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class OilWaterInterfaceDto {
  @ApiProperty({
    description: 'Nível da interface óleo em metros',
    example: 2.5,
  })
  @IsNumber()
  @Min(0)
  oilLevel: number;

  @ApiProperty({
    description: 'Nível da água em metros',
    example: 1.2,
  })
  @IsNumber()
  @Min(0)
  waterLevel: number;

  @ApiProperty({
    description: 'Nível da interface óleo-água em metros',
    example: 2.1,
  })
  @IsNumber()
  @Min(0)
  interfaceLevel: number;
}

export class SensorMetadataDto {
  @ApiPropertyOptional({
    description: 'Intensidade do sinal',
    example: -45,
  })
  @IsOptional()
  @IsNumber()
  signalStrength?: number;

  @ApiPropertyOptional({
    description: 'Temperatura ambiente em °C',
    example: 25.5,
  })
  @IsOptional()
  @IsNumber()
  temperature?: number;

  @ApiPropertyOptional({
    description: 'Umidade relativa em %',
    example: 65.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humidity?: number;

  @ApiPropertyOptional({
    description: 'Pressão atmosférica em hPa',
    example: 1013.25,
  })
  @IsOptional()
  @IsNumber()
  pressure?: number;

  @ApiPropertyOptional({
    description: 'Dados brutos do sensor',
    example: { raw_level: 1234, checksum: '0xAB' },
  })
  @IsOptional()
  @IsObject()
  rawData?: Record<string, any>;
}

export class SensorMessageDto {
  @ApiProperty({
    description: 'ID único do sensor',
    example: 'SENSOR-001',
  })
  @IsString()
  sensorId: string;

  @ApiProperty({
    description: 'Nível medido em metros',
    example: 3.45,
  })
  @IsNumber()
  @Min(0)
  level: number;

  @ApiPropertyOptional({
    description: 'Interface óleo-água (se aplicável)',
  })
  @IsOptional()
  @Type(() => OilWaterInterfaceDto)
  oilWaterInterface?: OilWaterInterfaceDto;

  @ApiPropertyOptional({
    description: 'Nível de bateria em porcentagem',
    example: 85.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({
    description: 'Metadados da medição',
  })
  @IsOptional()
  @Type(() => SensorMetadataDto)
  metadata?: SensorMetadataDto;

  @ApiPropertyOptional({
    description: 'Timestamp da medição (ISO 8601)',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiPropertyOptional({
    description: 'Versão do protocolo/firmware',
    example: '1.2.3',
  })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({
    description: 'Token de autenticação do sensor',
    example: 'sensor_token_123',
  })
  @IsOptional()
  @IsString()
  authToken?: string;
}

export class SensorCommandDto {
  @ApiProperty({
    description: 'ID único do sensor',
    example: 'SENSOR-001',
  })
  @IsString()
  sensorId: string;

  @ApiProperty({
    description: 'Comando a ser executado',
    example: 'CALIBRATE',
    enum: ['CALIBRATE', 'RESET', 'UPDATE_CONFIG', 'DIAGNOSTIC', 'SHUTDOWN'],
  })
  @IsString()
  command: 'CALIBRATE' | 'RESET' | 'UPDATE_CONFIG' | 'DIAGNOSTIC' | 'SHUTDOWN';

  @ApiPropertyOptional({
    description: 'Parâmetros do comando',
    example: { calibration_offset: 0.05, timeout: 30 },
  })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'ID da solicitação para rastreamento',
    example: 'req_123456',
  })
  @IsOptional()
  @IsString()
  requestId?: string;
}

export class SensorCommandResponseDto {
  @ApiProperty({
    description: 'ID único do sensor',
    example: 'SENSOR-001',
  })
  @IsString()
  sensorId: string;

  @ApiProperty({
    description: 'ID da solicitação original',
    example: 'req_123456',
  })
  @IsString()
  requestId: string;

  @ApiProperty({
    description: 'Status da execução do comando',
    example: 'SUCCESS',
    enum: ['SUCCESS', 'FAILED', 'PENDING', 'TIMEOUT'],
  })
  @IsString()
  status: 'SUCCESS' | 'FAILED' | 'PENDING' | 'TIMEOUT';

  @ApiPropertyOptional({
    description: 'Mensagem de resposta',
    example: 'Calibração executada com sucesso',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({
    description: 'Dados de resposta',
    example: { calibration_result: 0.02, duration_ms: 1500 },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, any>;

  @ApiProperty({
    description: 'Timestamp da resposta',
    example: '2024-01-15T10:30:05Z',
  })
  @IsDateString()
  timestamp: string;
}
