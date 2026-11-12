import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReadingsService } from './readings.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { ReadingFiltersDto } from './dto/reading-filters.dto';
import { Reading } from '../../entities/reading.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('Leituras')
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar nova leitura' })
  @ApiResponse({
    status: 201,
    description: 'Leitura criada com sucesso',
    type: Reading,
  })
  @ApiResponse({ status: 404, description: 'Sensor não encontrado' })
  async create(@Body() createReadingDto: CreateReadingDto): Promise<Reading> {
    return this.readingsService.create(createReadingDto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar leituras com filtros' })
  @ApiResponse({ status: 200, description: 'Leituras obtidas com sucesso' })
  @ApiQuery({ name: 'sensorId', required: false })
  @ApiQuery({ name: 'tankId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'page', required: false })
  async findAll(@Query() filters: ReadingFiltersDto) {
    return this.readingsService.findAll(filters);
  }

  @Get('sensor/:sensorId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar leituras de um sensor' })
  @ApiResponse({
    status: 200,
    description: 'Leituras do sensor obtidas com sucesso',
  })
  @ApiParam({ name: 'sensorId', description: 'ID do sensor' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findBySensor(
    @Param('sensorId') sensorId: string,
    @Query() filters: ReadingFiltersDto,
  ) {
    return this.readingsService.findBySensor(sensorId, filters);
  }

  @Get('tank/:tankId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar leituras de um tanque' })
  @ApiResponse({
    status: 200,
    description: 'Leituras do tanque obtidas com sucesso',
  })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findByTank(
    @Param('tankId') tankId: string,
    @Query() filters: ReadingFiltersDto,
  ) {
    return this.readingsService.findByTank(tankId, filters);
  }

  @Get('timeseries')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Série temporal agregada (TimescaleDB continuous aggregates)',
    description: 'Consultas rápidas de histórico longo. bucket=5m|1h|raw',
  })
  @ApiResponse({
    status: 200,
    description: 'Série temporal obtida com sucesso',
  })
  @ApiQuery({ name: 'sensorId', required: false })
  @ApiQuery({ name: 'tankId', required: false })
  @ApiQuery({ name: 'bucket', required: false, enum: ['5m', '1h', 'raw'] })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'limit', required: false })
  async getTimeseries(
    @Query('sensorId') sensorId?: string,
    @Query('tankId') tankId?: string,
    @Query('bucket') bucket?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    for (const [name, value] of [
      ['from', from],
      ['to', to],
    ] as const) {
      if (value !== undefined && isNaN(Date.parse(value))) {
        throw new BadRequestException({ code: 'invalidDateParam', name });
      }
    }
    return this.readingsService.getTimeseries({
      sensorId,
      tankId,
      bucket,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter leitura por ID' })
  @ApiResponse({
    status: 200,
    description: 'Leitura encontrada',
    type: Reading,
  })
  @ApiResponse({ status: 404, description: 'Leitura não encontrada' })
  @ApiParam({ name: 'id', description: 'ID da leitura' })
  async findOne(@Param('id') id: string): Promise<Reading> {
    return this.readingsService.findById(id);
  }

  @Get('sensor/:sensorId/latest')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter últimas leituras de um sensor' })
  @ApiResponse({
    status: 200,
    description: 'Últimas leituras obtidas com sucesso',
    type: [Reading],
  })
  @ApiParam({ name: 'sensorId', description: 'ID do sensor' })
  @ApiQuery({
    name: 'limit',
    description: 'Número de leituras',
    required: false,
  })
  async getLatestBySensor(
    @Param('sensorId') sensorId: string,
    @Query('limit') limit?: number,
  ): Promise<Reading[]> {
    return this.readingsService.getLatestBySensor(sensorId, limit || 10);
  }

  @Get('tank/:tankId/latest')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter últimas leituras de um tanque' })
  @ApiResponse({
    status: 200,
    description: 'Últimas leituras obtidas com sucesso',
    type: [Reading],
  })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  @ApiQuery({
    name: 'limit',
    description: 'Número de leituras',
    required: false,
  })
  async getLatestByTank(
    @Param('tankId') tankId: string,
    @Query('limit') limit?: number,
  ): Promise<Reading[]> {
    return this.readingsService.getLatestByTank(tankId, limit || 10);
  }

  @Get('sensor/:sensorId/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estatísticas das leituras de um sensor' })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  @ApiParam({ name: 'sensorId', description: 'ID do sensor' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getSensorStats(
    @Param('sensorId') sensorId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.readingsService.getReadingStats(
      sensorId,
      undefined,
      start,
      end,
    );
  }

  @Get('tank/:tankId/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estatísticas das leituras de um tanque' })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getTankStats(
    @Param('tankId') tankId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.readingsService.getReadingStats(undefined, tankId, start, end);
  }

  @Get('sensor/:sensorId/hourly')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregados horários das leituras de um sensor' })
  @ApiResponse({ status: 200, description: 'Agregados obtidos com sucesso' })
  @ApiParam({ name: 'sensorId', description: 'ID do sensor' })
  @ApiQuery({
    name: 'hours',
    description: 'Horas para agregar',
    required: false,
  })
  async getSensorHourlyAggregates(
    @Param('sensorId') sensorId: string,
    @Query('hours') hours?: number,
  ) {
    return this.readingsService.getHourlyAggregates(
      sensorId,
      undefined,
      hours || 24,
    );
  }

  @Get('tank/:tankId/hourly')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregados horários das leituras de um tanque' })
  @ApiResponse({ status: 200, description: 'Agregados obtidos com sucesso' })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  @ApiQuery({
    name: 'hours',
    description: 'Horas para agregar',
    required: false,
  })
  async getTankHourlyAggregates(
    @Param('tankId') tankId: string,
    @Query('hours') hours?: number,
  ) {
    return this.readingsService.getHourlyAggregates(
      undefined,
      tankId,
      hours || 24,
    );
  }

  @Post('maintenance/recalculate-volumes')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Recalcular volumes de leituras' })
  @ApiResponse({ status: 200, description: 'Volumes recalculados com sucesso' })
  @ApiQuery({
    name: 'sensorId',
    description: 'ID do sensor (opcional)',
    required: false,
  })
  async recalculateVolumes(@Query('sensorId') sensorId?: string) {
    const updatedCount =
      await this.readingsService.recalculateVolumes(sensorId);

    return {
      message: 'Volumes recalculados com sucesso',
      updatedReadings: updatedCount,
    };
  }

  @Post('maintenance/cleanup')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Limpar leituras antigas' })
  @ApiResponse({
    status: 200,
    description: 'Leituras antigas removidas com sucesso',
  })
  @ApiQuery({
    name: 'daysToKeep',
    description: 'Dias para manter',
    required: false,
  })
  async cleanupOldReadings(@Query('daysToKeep') daysToKeep?: number) {
    const deletedCount = await this.readingsService.deleteOldReadings(
      daysToKeep || 90,
    );

    return {
      message: 'Leituras antigas removidas com sucesso',
      deletedReadings: deletedCount,
      daysKept: daysToKeep || 90,
    };
  }

  @Get('global/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estatísticas globais de leituras' })
  @ApiResponse({
    status: 200,
    description: 'Estatísticas globais obtidas com sucesso',
  })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async getGlobalStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.readingsService.getReadingStats(
      undefined,
      undefined,
      start,
      end,
    );
  }

  @Get('global/hourly')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agregados horários globais' })
  @ApiResponse({
    status: 200,
    description: 'Agregados globais obtidos com sucesso',
  })
  @ApiQuery({
    name: 'hours',
    description: 'Horas para agregar',
    required: false,
  })
  async getGlobalHourlyAggregates(@Query('hours') hours?: number) {
    return this.readingsService.getHourlyAggregates(
      undefined,
      undefined,
      hours || 24,
    );
  }
}
