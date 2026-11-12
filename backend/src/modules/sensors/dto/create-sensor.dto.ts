import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsEnum,
  IsObject,
  Min,
  Max,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SensorType,
  SensorProtocol,
  SensorStatus,
} from '../../../entities/sensor.entity';

export class CreateSensorDto {
  @ApiProperty({
    description: 'ID único do sensor (geralmente fornecido pelo fabricante)',
    example: 'SENSOR-001',
  })
  @IsString()
  sensorId: string;

  @ApiProperty({
    description: 'Nome descritivo do sensor',
    example: 'Sensor de Nível - Tanque A',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Descrição detalhada do sensor',
    example: 'Sensor radar para medição de nível de óleo em tanque de flowback',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Tipo do sensor',
    enum: SensorType,
    example: SensorType.MAGNETOSTRICTIVE,
  })
  @IsEnum(SensorType)
  type: SensorType;

  @ApiProperty({
    description: 'Protocolo de comunicação',
    enum: SensorProtocol,
    example: SensorProtocol.MQTT,
  })
  @IsEnum(SensorProtocol)
  protocol: SensorProtocol;

  @ApiProperty({
    description: 'ID do tanque associado',
  })
  @IsUUID()
  tankId: string;

  @ApiPropertyOptional({
    description: 'Modelo do sensor',
    example: 'RL-1000',
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({
    description: 'Fabricante do sensor',
    example: 'SensorTech Industries',
  })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional({
    description: 'Versão do firmware',
    example: '2.1.3',
  })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @ApiPropertyOptional({
    description: 'Faixa de medição mínima (metros)',
    example: 0.1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  measurementRangeMin?: number;

  @ApiPropertyOptional({
    description: 'Faixa de medição máxima (metros)',
    example: 5.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  measurementRangeMax?: number;

  @ApiPropertyOptional({
    description: 'Precisão do sensor (metros ou porcentagem)',
    example: 0.01,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy?: number;

  @ApiPropertyOptional({
    description: 'Tensão de alimentação (volts)',
    example: 12.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  powerVoltage?: number;

  @ApiPropertyOptional({
    description: 'Data de instalação',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsDateString()
  installationDate?: string;

  @ApiPropertyOptional({
    description: 'Data da última calibração',
    example: '2024-01-15',
  })
  @IsOptional()
  @IsDateString()
  calibrationDate?: string;

  @ApiPropertyOptional({
    description: 'Data da próxima calibração',
    example: '2024-07-15',
  })
  @IsOptional()
  @IsDateString()
  nextCalibrationDate?: string;

  @ApiPropertyOptional({
    description: 'Configurações específicas do sensor',
    example: {
      updateInterval: 30,
      averagingSamples: 10,
      filterEnabled: true,
    },
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Sensor ativo',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
