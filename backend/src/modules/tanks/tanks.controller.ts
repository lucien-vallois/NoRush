import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TanksService } from './tanks.service';
import { CreateTankDto } from './dto/create-tank.dto';
import { UpdateTankDto } from './dto/update-tank.dto';
import { Tank, TankStatus } from '../../entities/tank.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('Tanques')
@Controller('tanks')
export class TanksController {
  constructor(private readonly tanksService: TanksService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo tanque' })
  @ApiResponse({ status: 201, description: 'Tanque criado com sucesso', type: Tank })
  @ApiResponse({ status: 409, description: 'Código do tanque já existe' })
  async create(@Body() createTankDto: CreateTankDto): Promise<Tank> {
    return this.tanksService.create(createTankDto);
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos os tanques' })
  @ApiResponse({ status: 200, description: 'Lista de tanques obtida com sucesso', type: [Tank] })
  @ApiQuery({ name: 'status', enum: TankStatus, required: false })
  async findAll(@Query('status') status?: TankStatus): Promise<Tank[]> {
    if (status) {
      return this.tanksService.getTanksByStatus(status);
    }
    return this.tanksService.findAll();
  }

  @Get('nearby')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Buscar tanques próximos a uma localização' })
  @ApiResponse({ status: 200, description: 'Tanques próximos encontrados', type: [Tank] })
  @ApiQuery({ name: 'lat', type: Number, description: 'Latitude' })
  @ApiQuery({ name: 'lng', type: Number, description: 'Longitude' })
  @ApiQuery({ name: 'radius', type: Number, description: 'Raio em km', required: false })
  async getNearbyTanks(
    @Query('lat') lat: number,
    @Query('lng') lng: number,
    @Query('radius') radius?: number,
  ): Promise<Tank[]> {
    return this.tanksService.getNearbyTanks(lat, lng, radius);
  }

  @Get('maintenance-needed')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar tanques que precisam de manutenção' })
  @ApiResponse({ status: 200, description: 'Tanques que precisam de manutenção', type: [Tank] })
  async getTanksNeedingMaintenance(): Promise<Tank[]> {
    return this.tanksService.getTanksNeedingMaintenance();
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter tanque por ID' })
  @ApiResponse({ status: 200, description: 'Tanque encontrado', type: Tank })
  @ApiResponse({ status: 404, description: 'Tanque não encontrado' })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  async findOne(@Param('id') id: string): Promise<Tank> {
    return this.tanksService.findById(id);
  }

  @Get('code/:code')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter tanque por código' })
  @ApiResponse({ status: 200, description: 'Tanque encontrado', type: Tank })
  @ApiResponse({ status: 404, description: 'Tanque não encontrado' })
  @ApiParam({ name: 'code', description: 'Código do tanque' })
  async findByCode(@Param('code') code: string): Promise<Tank> {
    return this.tanksService.findByCode(code);
  }

  @Get(':id/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter estatísticas do tanque' })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  async getStats(@Param('id') id: string): Promise<any> {
    return this.tanksService.getTankStats(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Atualizar tanque' })
  @ApiResponse({ status: 200, description: 'Tanque atualizado com sucesso', type: Tank })
  @ApiResponse({ status: 404, description: 'Tanque não encontrado' })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  async update(
    @Param('id') id: string,
    @Body() updateTankDto: UpdateTankDto,
  ): Promise<Tank> {
    return this.tanksService.update(id, updateTankDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deletar tanque' })
  @ApiResponse({ status: 204, description: 'Tanque deletado com sucesso' })
  @ApiResponse({ status: 404, description: 'Tanque não encontrado' })
  @ApiResponse({ status: 409, description: 'Tanque possui sensores associados' })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    return this.tanksService.delete(id);
  }

  @Post(':id/maintenance')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Registrar manutenção realizada' })
  @ApiResponse({ status: 200, description: 'Manutenção registrada com sucesso', type: Tank })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  async registerMaintenance(@Param('id') id: string): Promise<Tank> {
    return this.tanksService.updateMaintenanceDate(id, new Date());
  }

  @Post(':id/validate')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Validar configuração do tanque' })
  @ApiResponse({ status: 200, description: 'Validação realizada com sucesso' })
  @ApiParam({ name: 'id', description: 'ID do tanque' })
  async validateConfiguration(@Param('id') id: string): Promise<any> {
    return this.tanksService.validateTankConfiguration(id);
  }
}
