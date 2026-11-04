import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { GenerateReportDto, ReportType, ReportFormat } from './dto/generate-report.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';

@ApiTags('Relatórios')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post('generate')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gerar relatório',
    description: 'Gera um relatório no formato especificado (PDF, Excel ou CSV)',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  @ApiResponse({ status: 400, description: 'Parâmetros inválidos' })
  @ApiResponse({ status: 404, description: 'Dados não encontrados' })
  @ApiBody({ type: GenerateReportDto })
  async generateReport(
    @Body() dto: GenerateReportDto,
    @Res() res: Response,
  ) {
    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.send(result.buffer);
  }

  @Get('preview')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Preview de relatório',
    description: 'Obtém informações sobre um relatório sem gerá-lo',
  })
  @ApiResponse({ status: 200, description: 'Preview obtido com sucesso' })
  @ApiQuery({ name: 'type', enum: ReportType, description: 'Tipo do relatório' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Data inicial' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Data final' })
  @ApiQuery({ name: 'tankIds', required: false, description: 'IDs dos tanques' })
  @ApiQuery({ name: 'sensorIds', required: false, description: 'IDs dos sensores' })
  async getReportPreview(
    @Query('type') type: ReportType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('tankIds') tankIds?: string,
    @Query('sensorIds') sensorIds?: string,
  ) {
    const filters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      tankIds: tankIds ? tankIds.split(',') : undefined,
      sensorIds: sensorIds ? sensorIds.split(',') : undefined,
    };

    return this.reportsService.getReportPreview(type, filters);
  }

  @Get('available')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Relatórios disponíveis',
    description: 'Lista todos os tipos de relatório disponíveis no sistema',
  })
  @ApiResponse({ status: 200, description: 'Lista obtida com sucesso' })
  async getAvailableReports() {
    return this.reportsService.getAvailableReports();
  }

  @Get('stats')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Estatísticas dos relatórios',
    description: 'Obtém estatísticas de uso dos relatórios (apenas admin)',
  })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  async getReportsStats() {
    return this.reportsService.getReportsStats();
  }

  @Post('scheduled/generate')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Gerar relatórios agendados',
    description: 'Executa geração manual de relatórios agendados (apenas admin)',
  })
  @ApiResponse({ status: 200, description: 'Relatórios agendados gerados com sucesso' })
  async generateScheduledReports() {
    await this.reportsService.generateScheduledReports();
    return {
      message: 'Scheduled reports generated',
      timestamp: new Date().toISOString(),
    };
  }

  // Endpoints específicos para tipos comuns de relatório

  @Post('tank-level-history')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Histórico de níveis dos tanques',
    description: 'Gera relatório de histórico de níveis dos tanques',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['pdf', 'excel', 'csv'] },
        startDate: { type: 'string', format: 'date' },
        endDate: { type: 'string', format: 'date' },
        tankIds: { type: 'array', items: { type: 'string' } },
        title: { type: 'string' },
      },
    },
  })
  async generateTankLevelHistory(
    @Body() body: {
      format: ReportFormat;
      startDate: string;
      endDate: string;
      tankIds?: string[];
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.TANK_LEVEL_HISTORY,
      format: body.format,
      startDate: body.startDate,
      endDate: body.endDate,
      tankIds: body.tankIds,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('sensor-performance')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Performance dos sensores',
    description: 'Gera relatório de performance dos sensores',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  async generateSensorPerformance(
    @Body() body: {
      format: ReportFormat;
      startDate: string;
      endDate: string;
      sensorIds?: string[];
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.SENSOR_PERFORMANCE,
      format: body.format,
      startDate: body.startDate,
      endDate: body.endDate,
      sensorIds: body.sensorIds,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('alert-summary')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Resumo de alertas',
    description: 'Gera relatório de resumo de alertas',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  async generateAlertSummary(
    @Body() body: {
      format: ReportFormat;
      startDate: string;
      endDate: string;
      tankIds?: string[];
      sensorIds?: string[];
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.ALERT_SUMMARY,
      format: body.format,
      startDate: body.startDate,
      endDate: body.endDate,
      tankIds: body.tankIds,
      sensorIds: body.sensorIds,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('system-overview')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Visão geral do sistema',
    description: 'Gera relatório de visão geral do sistema',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  async generateSystemOverview(
    @Body() body: {
      format: ReportFormat;
      startDate?: string;
      endDate?: string;
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.SYSTEM_OVERVIEW,
      format: body.format,
      startDate: body.startDate,
      endDate: body.endDate,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('maintenance-schedule')
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cronograma de manutenção',
    description: 'Gera relatório de cronograma de manutenção',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  async generateMaintenanceSchedule(
    @Body() body: {
      format: ReportFormat;
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.MAINTENANCE_SCHEDULE,
      format: body.format,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }

  @Post('production-analysis')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Análise de produção',
    description: 'Gera relatório de análise de produção',
  })
  @ApiResponse({ status: 200, description: 'Relatório gerado com sucesso' })
  async generateProductionAnalysis(
    @Body() body: {
      format: ReportFormat;
      startDate: string;
      endDate: string;
      tankIds?: string[];
      title?: string;
    },
    @Res() res: Response,
  ) {
    const dto: GenerateReportDto = {
      type: ReportType.PRODUCTION_ANALYSIS,
      format: body.format,
      startDate: body.startDate,
      endDate: body.endDate,
      tankIds: body.tankIds,
      title: body.title,
    };

    const result = await this.reportsService.generateReport(dto);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.buffer);
  }
}
