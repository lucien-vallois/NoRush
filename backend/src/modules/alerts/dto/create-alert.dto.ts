import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsObject,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertType, AlertSeverity } from '../../../entities/alert.entity';

export class CreateAlertDto {
  @ApiProperty({
    description: 'Tipo do alerta',
    enum: AlertType,
    example: AlertType.HIGH_LEVEL,
  })
  @IsEnum(AlertType)
  type: AlertType;

  @ApiProperty({
    description: 'Severidade do alerta',
    enum: AlertSeverity,
    example: AlertSeverity.MEDIUM,
  })
  @IsEnum(AlertSeverity)
  severity: AlertSeverity;

  @ApiProperty({
    description: 'Título do alerta',
    example: 'Nível Alto Detectado',
  })
  @IsString()
  title: string;

  @ApiProperty({
    description: 'Mensagem detalhada do alerta',
    example:
      'O nível do tanque TANK-001 atingiu 4.2m, próximo ao limite máximo de 4.5m',
  })
  @IsString()
  message: string;

  @ApiProperty({
    description: 'ID do tanque relacionado',
  })
  @IsUUID()
  tankId: string;

  @ApiPropertyOptional({
    description: 'ID do sensor que gerou o alerta',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  sensorId?: string;

  @ApiPropertyOptional({
    description: 'Nível atual no momento do alerta',
    example: 4.2,
  })
  @IsOptional()
  @IsNumber()
  currentLevel?: number;

  @ApiPropertyOptional({
    description: 'Volume atual no momento do alerta',
    example: 2950.5,
  })
  @IsOptional()
  @IsNumber()
  currentVolume?: number;

  @ApiPropertyOptional({
    description: 'Valor do limite que foi atingido',
    example: 4.5,
  })
  @IsOptional()
  @IsNumber()
  thresholdValue?: number;

  @ApiPropertyOptional({
    description: 'Metadados adicionais do alerta',
    example: {
      readingId: '550e8400-e29b-41d4-a716-446655440001',
      signalStrength: -45,
      batteryLevel: 85,
    },
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Timestamp do alerta',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;
}
