import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { DevicesService } from './devices.service';
import { ProvisionDeviceDto } from './dto/provision-device.dto';
import { DeviceCredentialsService } from './device-credentials.service';

/**
 * Ciclo de vida de dispositivos para o bring-up de hardware real:
 * provisionar → instalar → rotacionar → revogar. O secret só aparece
 * na resposta de provisionamento/rotação; persiste apenas o sha256.
 */
@ApiTags('Devices')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devices: DevicesService,
    private readonly credentials: DeviceCredentialsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Listar dispositivos com estado de provisionamento',
  })
  @ApiResponse({ status: 200, description: 'Lista de dispositivos' })
  async list() {
    return {
      authMode: this.credentials.authMode,
      devices: await this.devices.list(),
    };
  }

  @Get(':sensorId')
  @ApiOperation({ summary: 'Detalhe de um dispositivo' })
  @ApiResponse({ status: 200, description: 'Dispositivo encontrado' })
  @ApiResponse({ status: 404, description: 'Dispositivo não encontrado' })
  async detail(@Param('sensorId') sensorId: string) {
    return this.devices.detail(sensorId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Provisionar dispositivo e emitir credencial',
    description:
      'Cria (tankId obrigatório) ou reprovisiona (sensorId existente) e devolve o secret uma única vez.',
  })
  @ApiResponse({ status: 201, description: 'Dispositivo provisionado' })
  async provision(@Body() dto: ProvisionDeviceDto) {
    return this.devices.provision(dto);
  }

  @Post(':sensorId/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotacionar a credencial do dispositivo' })
  @ApiResponse({ status: 200, description: 'Nova credencial emitida' })
  @ApiResponse({ status: 404, description: 'Dispositivo não encontrado' })
  async rotate(@Param('sensorId') sensorId: string) {
    return this.devices.rotate(sensorId);
  }

  @Delete(':sensorId/credentials')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revogar a credencial do dispositivo',
    description:
      'A telemetria autenticada por credencial individual passa a ser recusada até novo provisionamento.',
  })
  @ApiResponse({ status: 200, description: 'Credencial revogada' })
  @ApiResponse({ status: 404, description: 'Dispositivo não encontrado' })
  async revoke(@Param('sensorId') sensorId: string) {
    return this.devices.revoke(sensorId);
  }
}
