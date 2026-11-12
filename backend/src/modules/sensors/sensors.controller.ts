import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SensorsService } from './sensors.service';
import { CreateSensorDto } from './dto/create-sensor.dto';
import { UpdateSensorDto } from './dto/update-sensor.dto';
import { SensorFiltersDto } from './dto/sensor-filters.dto';
import {
  Sensor,
  SensorStatus,
  SensorType,
  SensorProtocol,
} from '../../entities/sensor.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('Sensores')
@Controller('sensors')
export class SensorsController {
  constructor(private readonly sensorsService: SensorsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo sensor' })
  @ApiResponse({
    status: 201,
    description: 'Sensor criado com sucesso',
    type: Sensor,
  })
  @ApiResponse({ status: 409, description: 'ID do sensor já existe' })
  @ApiResponse({ status: 404, description: 'Tanque não encontrado' })
  async create(@Body() createSensorDto: CreateSensorDto): Promise<Sensor> {
    return this.sensorsService.create(createSensorDto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores com filtros' })
  @ApiResponse({
    status: 200,
    description: 'Lista de sensores obtida com sucesso',
    type: [Sensor],
  })
  @ApiQuery({ name: 'type', enum: SensorType, required: false })
  @ApiQuery({ name: 'protocol', enum: SensorProtocol, required: false })
  @ApiQuery({ name: 'status', enum: SensorStatus, required: false })
  @ApiQuery({ name: 'tankId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'onlineOnly', type: Boolean, required: false })
  async findAll(@Query() filters: SensorFiltersDto): Promise<Sensor[]> {
    return this.sensorsService.findAll(filters);
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estatísticas do dashboard de sensores' })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  async getDashboard(): Promise<any> {
    return this.sensorsService.getSensorsDashboard();
  }

  @Get('online')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores online' })
  @ApiResponse({
    status: 200,
    description: 'Sensores online obtidos com sucesso',
    type: [Sensor],
  })
  async getOnlineSensors(): Promise<Sensor[]> {
    return this.sensorsService.getOnlineSensors();
  }

  @Get('maintenance-needed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores que precisam de manutenção' })
  @ApiResponse({
    status: 200,
    description: 'Sensores que precisam de manutenção',
    type: [Sensor],
  })
  async getSensorsNeedingMaintenance(): Promise<Sensor[]> {
    return this.sensorsService.getSensorsNeedingCalibration();
  }

  @Get('low-battery')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores com bateria baixa' })
  @ApiResponse({
    status: 200,
    description: 'Sensores com bateria baixa',
    type: [Sensor],
  })
  async getSensorsWithLowBattery(): Promise<Sensor[]> {
    return this.sensorsService.getSensorsWithLowBattery();
  }

  @Get('tank/:tankId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores de um tanque' })
  @ApiResponse({
    status: 200,
    description: 'Sensores do tanque obtidos com sucesso',
    type: [Sensor],
  })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  async getSensorsByTank(@Param('tankId') tankId: string): Promise<Sensor[]> {
    return this.sensorsService.getSensorsByTank(tankId);
  }

  @Get('type/:type')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores por tipo' })
  @ApiResponse({
    status: 200,
    description: 'Sensores do tipo obtidos com sucesso',
    type: [Sensor],
  })
  @ApiParam({ name: 'type', enum: SensorType, description: 'Tipo do sensor' })
  async getSensorsByType(@Param('type') type: SensorType): Promise<Sensor[]> {
    return this.sensorsService.getSensorsByType(type);
  }

  @Get('status/:status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar sensores por status' })
  @ApiResponse({
    status: 200,
    description: 'Sensores do status obtidos com sucesso',
    type: [Sensor],
  })
  @ApiParam({
    name: 'status',
    enum: SensorStatus,
    description: 'Status do sensor',
  })
  async getSensorsByStatus(
    @Param('status') status: SensorStatus,
  ): Promise<Sensor[]> {
    return this.sensorsService.getSensorsByStatus(status);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter sensor por ID' })
  @ApiResponse({ status: 200, description: 'Sensor encontrado', type: Sensor })
  @ApiResponse({ status: 404, description: 'Sensor não encontrado' })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  async findOne(@Param('id') id: string): Promise<Sensor> {
    return this.sensorsService.findById(id);
  }

  @Get('by-sensor-id/:sensorId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter sensor por sensorId' })
  @ApiResponse({ status: 200, description: 'Sensor encontrado', type: Sensor })
  @ApiResponse({ status: 404, description: 'Sensor não encontrado' })
  @ApiParam({ name: 'sensorId', description: 'ID único do sensor' })
  async findBySensorId(@Param('sensorId') sensorId: string): Promise<Sensor> {
    return this.sensorsService.findBySensorId(sensorId);
  }

  @Get(':id/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter estatísticas detalhadas do sensor' })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  async getStats(@Param('id') id: string): Promise<any> {
    return this.sensorsService.getSensorStats(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar sensor' })
  @ApiResponse({
    status: 200,
    description: 'Sensor atualizado com sucesso',
    type: Sensor,
  })
  @ApiResponse({ status: 404, description: 'Sensor não encontrado' })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  async update(
    @Param('id') id: string,
    @Body() updateSensorDto: UpdateSensorDto,
  ): Promise<Sensor> {
    return this.sensorsService.update(id, updateSensorDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deletar sensor' })
  @ApiResponse({ status: 204, description: 'Sensor deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Sensor não encontrado' })
  @ApiResponse({
    status: 409,
    description: 'Sensor possui leituras associadas',
  })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.sensorsService.delete(id);
  }

  @Post(':id/calibration')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar calibração realizada' })
  @ApiResponse({
    status: 200,
    description: 'Calibração registrada com sucesso',
    type: Sensor,
  })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  async registerCalibration(@Param('id') id: string): Promise<Sensor> {
    return this.sensorsService.updateCalibrationDate(id, new Date());
  }

  @Post(':id/firmware')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar versão do firmware' })
  @ApiResponse({
    status: 200,
    description: 'Firmware atualizado com sucesso',
    type: Sensor,
  })
  @ApiParam({ name: 'id', description: 'ID do sensor' })
  async updateFirmware(
    @Param('id') id: string,
    @Body() body: { firmwareVersion: string },
  ): Promise<Sensor> {
    return this.sensorsService.updateFirmwareVersion(id, body.firmwareVersion);
  }

  @Post('bulk/status')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar status de múltiplos sensores' })
  @ApiResponse({
    status: 200,
    description: 'Sensores atualizados com sucesso',
    type: [Sensor],
  })
  @ApiResponse({ status: 400, description: 'Lista vazia ou muito grande' })
  async bulkUpdateStatus(
    @Body() body: { sensorIds: string[]; status: SensorStatus },
  ): Promise<Sensor[]> {
    const { sensorIds, status } = body;
    return this.sensorsService.bulkUpdateStatus(sensorIds, status);
  }

  @Post('bulk/calibration')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar calibração para múltiplos sensores' })
  @ApiResponse({
    status: 200,
    description: 'Calibrações registradas com sucesso',
    type: [Sensor],
  })
  async bulkRegisterCalibration(
    @Body() body: { sensorIds: string[] },
  ): Promise<Sensor[]> {
    const results: Sensor[] = [];
    for (const sensorId of body.sensorIds) {
      const result = await this.sensorsService.updateCalibrationDate(
        sensorId,
        new Date(),
      );
      results.push(result);
    }
    return results;
  }
}
