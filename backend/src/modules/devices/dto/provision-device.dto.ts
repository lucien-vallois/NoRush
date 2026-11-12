import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNumber,
  Min,
  Max,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SensorType, SensorProtocol } from '../../../entities/sensor.entity';

/** IDs públicos seguem SENSOR-NNN na demo; hardware real pode usar serial do fabricante. */
const SENSOR_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

export class ProvisionDeviceDto {
  @ApiPropertyOptional({
    description:
      'ID público do dispositivo. Se omitido, um novo é gerado (exige tankId). Se informado e já existir, provisiona o sensor existente.',
    example: 'SENSOR-101',
  })
  @IsOptional()
  @IsString()
  @Matches(SENSOR_ID_PATTERN, {
    message: 'sensorId must be 3-64 characters: letters, numbers, - and _',
  })
  sensorId?: string;

  @ApiPropertyOptional({ description: 'Nome amigável do dispositivo' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    description:
      'Tanque ao qual o dispositivo será associado. Obrigatório apenas quando o sensor ainda não existe.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tankId?: string;

  @ApiPropertyOptional({
    enum: SensorType,
    default: SensorType.MAGNETOSTRICTIVE,
  })
  @IsOptional()
  @IsEnum(SensorType)
  type?: SensorType;

  @ApiPropertyOptional({ enum: SensorProtocol, default: SensorProtocol.MQTT })
  @IsOptional()
  @IsEnum(SensorProtocol)
  protocol?: SensorProtocol;

  @ApiPropertyOptional({ description: 'Modelo do hardware (ex.: NRK-B1)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @ApiPropertyOptional({ description: 'Fabricante' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  manufacturer?: string;

  @ApiPropertyOptional({
    description: 'Versão de firmware reportada no bring-up',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  firmwareVersion?: string;

  @ApiPropertyOptional({ description: 'Faixa mínima de medição em metros' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  measurementRangeMin?: number;

  @ApiPropertyOptional({ description: 'Faixa máxima de medição em metros' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  measurementRangeMax?: number;
}

export class HeartbeatDto {
  @ApiProperty({
    description: 'ID público do dispositivo',
    example: 'SENSOR-101',
  })
  @IsString()
  sensorId: string;

  @ApiPropertyOptional({
    description:
      'Credencial do dispositivo; alternativa ao header X-Device-Token',
  })
  @IsOptional()
  @IsString()
  authToken?: string;

  @ApiPropertyOptional({ description: 'Nível de bateria em %' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ description: 'Versão de firmware em execução' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  firmwareVersion?: string;

  @ApiPropertyOptional({ description: 'Intensidade do sinal em dBm' })
  @IsOptional()
  @IsNumber()
  signalStrength?: number;

  @ApiPropertyOptional({ description: 'Timestamp do heartbeat (ISO 8601)' })
  @IsOptional()
  @IsString()
  timestamp?: string;
}
