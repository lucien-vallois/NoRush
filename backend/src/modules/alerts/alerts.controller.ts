import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
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
import { AlertsService } from './alerts.service';
import { AlertProcessorService } from './alert-processor.service';
import { NotificationService } from './notification.service';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertFiltersDto } from './dto/alert-filters.dto';
import { Alert, AlertStatus, AlertSeverity, AlertType } from '../../entities/alert.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../entities/user.entity';
import { I18nService } from '../../i18n/i18n.service';
import { CurrentLang } from '../../i18n/current-lang.decorator';
import { CurrentUnits } from '../../common/decorators/current-units.decorator';
import type { UnitPreference } from '../../common/decorators/current-units.decorator';

@ApiTags('Alerts')
@Controller('alerts')
export class AlertsController {
  constructor(
    private readonly alertsService: AlertsService,
    private readonly alertProcessor: AlertProcessorService,
    private readonly notificationService: NotificationService,
    private readonly i18n: I18nService,
  ) {}

  /**
   * Borda de i18n: o serviço devolve a entidade canônica (texto persistido
   * em EN) e o controller recompõe title/message no idioma do request a
   * partir do type + parâmetros. Histórico antigo também é traduzido.
   * (Object.assign sobre protótipo preserva os métodos da entidade.)
   */
  private localized(alert: Alert, lang: string, units: UnitPreference): Alert {
    const { title, message } = this.i18n.localizeAlert(alert, lang, units);
    return Object.assign(
      Object.create(Object.getPrototypeOf(alert)),
      alert,
      { title, message },
    );
  }

  private localizedList(
    alerts: Alert[],
    lang: string,
    units: UnitPreference,
  ): Alert[] {
    return alerts.map((alert) => this.localized(alert, lang, units));
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MAINTENANCE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new alert' })
  @ApiResponse({ status: 201, description: 'Alert created successfully', type: Alert })
  @ApiResponse({ status: 404, description: 'Tank not found' })
  async create(
    @Body() createAlertDto: CreateAlertDto,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert> {
    return this.localized(
      await this.alertsService.create(createAlertDto),
      lang,
      units,
    );
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts with filters' })
  @ApiResponse({ status: 200, description: 'Alerts fetched successfully' })
  @ApiQuery({ name: 'type', enum: AlertType, required: false })
  @ApiQuery({ name: 'severity', enum: AlertSeverity, required: false })
  @ApiQuery({ name: 'status', enum: AlertStatus, required: false })
  @ApiQuery({ name: 'tankId', required: false })
  @ApiQuery({ name: 'sensorId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  async findAll(
    @Query() filters: AlertFiltersDto,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ) {
    const result = await this.alertsService.findAll(filters);
    return { ...result, alerts: this.localizedList(result.alerts, lang, units) };
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alert dashboard statistics' })
  @ApiResponse({ status: 200, description: 'Statistics fetched successfully' })
  async getDashboard() {
    return this.alertsService.getAlertStats();
  }

  @Get('active')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active alerts' })
  @ApiResponse({ status: 200, description: 'Active alerts fetched successfully', type: [Alert] })
  async getActiveAlerts(
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getActiveAlerts(),
      lang,
      units,
    );
  }

  @Get('critical')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List critical alerts' })
  @ApiResponse({ status: 200, description: 'Critical alerts fetched successfully', type: [Alert] })
  async getCriticalAlerts(
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getCriticalAlerts(),
      lang,
      units,
    );
  }

  @Get('unacknowledged')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List unacknowledged alerts' })
  @ApiResponse({ status: 200, description: 'Unacknowledged alerts fetched successfully', type: [Alert] })
  async getUnacknowledgedAlerts(
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getUnacknowledgedAlerts(),
      lang,
      units,
    );
  }

  @Get('requiring-action')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts requiring action' })
  @ApiResponse({ status: 200, description: 'Alerts fetched successfully', type: [Alert] })
  async getAlertsRequiringAction(
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getAlertsRequiringAction(),
      lang,
      units,
    );
  }

  @Get('tank/:tankId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts for a tank' })
  @ApiResponse({ status: 200, description: 'Tank alerts fetched successfully' })
  @ApiParam({ name: 'tankId', description: 'Tank ID' })
  async getAlertsByTank(
    @Param('tankId') tankId: string,
    @Query() filters: AlertFiltersDto,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ) {
    const result = await this.alertsService.getAlertsByTank(tankId, filters);
    return { ...result, alerts: this.localizedList(result.alerts, lang, units) };
  }

  @Get('type/:type')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts by type' })
  @ApiResponse({ status: 200, description: 'Alerts fetched successfully', type: [Alert] })
  @ApiParam({ name: 'type', enum: AlertType, description: 'Alert type' })
  async getAlertsByType(
    @Param('type') type: AlertType,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getAlertsByType(type),
      lang,
      units,
    );
  }

  @Get('severity/:severity')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts by severity' })
  @ApiResponse({ status: 200, description: 'Alerts fetched successfully', type: [Alert] })
  @ApiParam({ name: 'severity', enum: AlertSeverity, description: 'Alert severity' })
  async getAlertsBySeverity(
    @Param('severity') severity: AlertSeverity,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getAlertsBySeverity(severity),
      lang,
      units,
    );
  }

  @Get('status/:status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alerts by status' })
  @ApiResponse({ status: 200, description: 'Alerts fetched successfully', type: [Alert] })
  @ApiParam({ name: 'status', enum: AlertStatus, description: 'Alert status' })
  async getAlertsByStatus(
    @Param('status') status: AlertStatus,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.getAlertsByStatus(status),
      lang,
      units,
    );
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get alert by ID' })
  @ApiResponse({ status: 200, description: 'Alert found', type: Alert })
  @ApiResponse({ status: 404, description: 'Alert not found' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async findOne(
    @Param('id') id: string,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert> {
    return this.localized(await this.alertsService.findById(id), lang, units);
  }

  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acknowledge alert' })
  @ApiResponse({ status: 200, description: 'Alert acknowledged successfully', type: Alert })
  @ApiResponse({ status: 400, description: 'Alert already acknowledged or resolved' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async acknowledgeAlert(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
    @Body() body?: { notes?: string },
  ): Promise<Alert> {
    return this.localized(
      await this.alertsService.acknowledgeAlert(id, user.id, body?.notes),
      lang,
      units,
    );
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve alert' })
  @ApiResponse({ status: 200, description: 'Alert resolved successfully', type: Alert })
  @ApiResponse({ status: 400, description: 'Alert already resolved' })
  @ApiParam({ name: 'id', description: 'Alert ID' })
  async resolveAlert(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
    @Body() body?: { resolutionNotes?: string },
  ): Promise<Alert> {
    return this.localized(
      await this.alertsService.resolveAlert(id, user.id, body?.resolutionNotes),
      lang,
      units,
    );
  }

  @Post('bulk/acknowledge')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Acknowledge multiple alerts' })
  @ApiResponse({ status: 200, description: 'Alerts acknowledged successfully', type: [Alert] })
  async bulkAcknowledge(
    @Body() body: { alertIds: string[]; notes?: string },
    @CurrentUser() user: User,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.bulkAcknowledge(body.alertIds, user.id),
      lang,
      units,
    );
  }

  @Post('bulk/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve multiple alerts' })
  @ApiResponse({ status: 200, description: 'Alerts resolved successfully', type: [Alert] })
  async bulkResolve(
    @Body() body: { alertIds: string[]; resolutionNotes?: string },
    @CurrentUser() user: User,
    @CurrentLang() lang: string,
    @CurrentUnits() units: UnitPreference,
  ): Promise<Alert[]> {
    return this.localizedList(
      await this.alertsService.bulkResolve(body.alertIds, user.id, body.resolutionNotes),
      lang,
      units,
    );
  }

  @Get('processor/stats')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Alert processor statistics' })
  @ApiResponse({ status: 200, description: 'Statistics fetched successfully' })
  async getProcessorStats() {
    return this.alertProcessor.getStats();
  }

  @Get('notifications/status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Notification channel status' })
  @ApiResponse({ status: 200, description: 'Status fetched successfully' })
  async getNotificationStatus() {
    return this.notificationService.getChannelStatus();
  }

  @Post('notifications/test/:channel')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test a notification channel' })
  @ApiResponse({ status: 200, description: 'Test executed successfully' })
  @ApiParam({ name: 'channel', description: 'Channel to test (email, sms, push, slack)' })
  async testNotificationChannel(
    @Param('channel') channel: string,
    @CurrentLang() lang: string,
  ) {
    const success = await this.notificationService.testChannel(channel);

    return {
      channel,
      success,
      message: this.i18n.translate(
        lang,
        success ? 'exceptions.notificationTestOk' : 'exceptions.notificationTestFail',
        { channel },
      ),
    };
  }

  @Post('processor/check-offline')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually check offline sensors' })
  @ApiResponse({ status: 200, description: 'Check executed successfully' })
  async checkOfflineSensors(@CurrentLang() lang: string) {
    await this.alertProcessor.checkSensorOfflineAlerts();

    return {
      message: this.i18n.translate(lang, 'exceptions.offlineCheckExecuted'),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('processor/check-battery')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually check sensor batteries' })
  @ApiResponse({ status: 200, description: 'Check executed successfully' })
  async checkLowBattery(@CurrentLang() lang: string) {
    await this.alertProcessor.checkLowBatteryAlerts();

    return {
      message: this.i18n.translate(lang, 'exceptions.batteryCheckExecuted'),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('processor/check-maintenance')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually check pending maintenance' })
  @ApiResponse({ status: 200, description: 'Check executed successfully' })
  async checkMaintenance(@CurrentLang() lang: string) {
    await this.alertProcessor.checkMaintenanceAlerts();

    return {
      message: this.i18n.translate(lang, 'exceptions.maintenanceCheckExecuted'),
      timestamp: new Date().toISOString(),
    };
  }

  @Post('processor/check-errors')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Manually check sensor errors' })
  @ApiResponse({ status: 200, description: 'Check executed successfully' })
  async checkSensorErrors(@CurrentLang() lang: string) {
    await this.alertProcessor.checkSensorErrorAlerts();

    return {
      message: this.i18n.translate(lang, 'exceptions.sensorErrorCheckExecuted'),
      timestamp: new Date().toISOString(),
    };
  }
}
