import { PartialType } from '@nestjs/swagger';
import { CreateSensorDto } from './create-sensor.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SensorStatus } from '../../../entities/sensor.entity';

export class UpdateSensorDto extends PartialType(CreateSensorDto) {
  @ApiPropertyOptional({
    description: 'Status do sensor',
    enum: SensorStatus,
    example: SensorStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(SensorStatus)
  status?: SensorStatus;
}
