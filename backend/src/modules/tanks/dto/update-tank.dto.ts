import { PartialType } from '@nestjs/swagger';
import { CreateTankDto } from './create-tank.dto';
import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TankStatus } from '../../../entities/tank.entity';

export class UpdateTankDto extends PartialType(CreateTankDto) {
  @ApiPropertyOptional({
    description: 'Status do tanque',
    enum: TankStatus,
    example: TankStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(TankStatus)
  status?: TankStatus;
}
