import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Query,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { IotGatewayService } from './iot-gateway.service';
import { HttpService } from './http.service';
import { SensorMessageDto, SensorCommandDto } from './dto/sensor-message.dto';
import { HeartbeatDto } from '../devices/dto/provision-device.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../entities/user.entity';
import { DevOnlyGuard } from '../../common/guards/dev-only.guard';

const DEVICE_TOKEN_HEADER = 'x-device-token';

@ApiTags('IoT Gateway')
@Controller('iot')
export class IotGatewayController {
  private readonly logger = new Logger(IotGatewayController.name);

  constructor(
    private readonly iotGateway: IotGatewayService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Credencial por dispositivo pode viajar no payload (authToken) ou no
   * header X-Device-Token — preferível com TLS para não constar em logs
   * de corpo. O header vence se ambos forem enviados.
   */
  private applyDeviceHeader(
    body: { authToken?: string },
    deviceToken: string | undefined,
  ): void {
    if (deviceToken) body.authToken = deviceToken;
  }

  @Public()
  @Post('sensors/data')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receber dados de sensor via HTTP',
    description:
      'Endpoint para dispositivos enviarem telemetria via HTTP (alternativa ao MQTT). Credencial no payload (authToken) ou header X-Device-Token.',
  })
  @ApiResponse({ status: 200, description: 'Dados processados com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos' })
  @ApiBody({ type: SensorMessageDto })
  async receiveSensorData(
    @Body() sensorMessage: SensorMessageDto,
    @Headers(DEVICE_TOKEN_HEADER) deviceToken?: string,
  ) {
    this.applyDeviceHeader(sensorMessage, deviceToken);
    return this.httpService.processSensorData(sensorMessage);
  }

  @Public()
  @Post('sensors/batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receber dados em lote de múltiplos sensores',
    description:
      'Endpoint para processar dados de múltiplos sensores em uma única requisição (backfill de armazenamento limitado)',
  })
  @ApiResponse({ status: 200, description: 'Lote processado com sucesso' })
  @ApiResponse({ status: 400, description: 'Dados inválidos ou lote muito grande' })
  @ApiBody({ type: [SensorMessageDto], description: 'Array de mensagens de sensores' })
  async receiveBatchData(@Body() messages: SensorMessageDto[]) {
    return this.httpService.processBatchSensorData(messages);
  }

  @Public()
  @Post('sensors/heartbeat')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Heartbeat de dispositivo',
    description:
      'Sinal de vida sem leitura de nível: atualiza última transmissão, bateria e firmware. Credencial igual à telemetria.',
  })
  @ApiResponse({ status: 200, description: 'Heartbeat processado' })
  @ApiBody({ type: HeartbeatDto })
  async receiveHeartbeat(
    @Body() heartbeat: HeartbeatDto,
    @Headers(DEVICE_TOKEN_HEADER) deviceToken?: string,
  ) {
    this.applyDeviceHeader(heartbeat, deviceToken);
    return this.httpService.processHeartbeat(heartbeat);
  }

  @Post('sensors/commands')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Enviar comando para sensor',
    description: 'Endpoint para enviar comandos de controle para sensores específicos',
  })
  @ApiResponse({ status: 200, description: 'Comando enviado com sucesso' })
  @ApiResponse({ status: 400, description: 'Comando inválido' })
  @ApiBody({ type: SensorCommandDto })
  async sendCommand(@Body() command: SensorCommandDto) {
    return this.httpService.sendCommandToSensor(command);
  }

  @Get('sensors/commands/:requestId')
  @ApiOperation({
    summary: 'Verificar status de comando',
    description: 'Consultar o status de execução de um comando enviado para um sensor',
  })
  @ApiResponse({ status: 200, description: 'Status obtido com sucesso' })
  @ApiResponse({ status: 404, description: 'Request ID não encontrado' })
  @ApiParam({ name: 'requestId', description: 'ID da requisição do comando' })
  async getCommandStatus(@Param('requestId') requestId: string) {
    return this.httpService.getCommandStatus(requestId);
  }

  @Get('sensors/:sensorId/status')
  @ApiOperation({
    summary: 'Obter status de sensor',
    description: 'Consultar informações de status e conectividade de um sensor específico',
  })
  @ApiResponse({ status: 200, description: 'Status obtido com sucesso' })
  @ApiParam({ name: 'sensorId', description: 'ID do sensor' })
  async getSensorStatus(@Param('sensorId') sensorId: string) {
    return this.httpService.getSensorStatus(sensorId);
  }

  @Get('gateway/stats')
  @ApiOperation({
    summary: 'Estatísticas do Gateway IoT',
    description: 'Obter estatísticas detalhadas do funcionamento do gateway IoT',
  })
  @ApiResponse({ status: 200, description: 'Estatísticas obtidas com sucesso' })
  async getGatewayStats() {
    return this.iotGateway.getStats();
  }

  @Get('gateway/config')
  @ApiOperation({
    summary: 'Configuração do Gateway IoT',
    description: 'Obter configuração atual do gateway IoT',
  })
  @ApiResponse({ status: 200, description: 'Configuração obtida com sucesso' })
  async getGatewayConfig() {
    return this.iotGateway.getConfiguration();
  }

  @Get('gateway/health')
  @ApiOperation({
    summary: 'Verificação de saúde do Gateway IoT',
    description: 'Verificar status de conectividade e saúde dos componentes do gateway',
  })
  @ApiResponse({ status: 200, description: 'Status de saúde obtido com sucesso' })
  async getGatewayHealth() {
    return this.iotGateway.testConnectivity();
  }

  @Post('gateway/restart')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reiniciar conexões do Gateway',
    description: 'Forçar reinicialização das conexões do gateway IoT',
  })
  @ApiResponse({ status: 200, description: 'Reinicialização solicitada com sucesso' })
  async restartGateway() {
    return this.iotGateway.restartConnections();
  }

  // Rotas de teste: admin apenas, e bloqueadas em produção.
  @Post('test/simulate')
  @Roles(UserRole.ADMIN)
  @UseGuards(DevOnlyGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Simular dados de sensor (Teste)',
    description:
      'Gerar dados simulados para teste do sistema (apenas desenvolvimento; recusado em produção)',
  })
  @ApiResponse({ status: 200, description: 'Simulação executada com sucesso' })
  @ApiResponse({ status: 403, description: 'Somente admin, e nunca em produção' })
  @ApiQuery({ name: 'sensorId', description: 'ID do sensor para simulação' })
  @ApiQuery({ name: 'protocol', enum: ['mqtt', 'http'], description: 'Protocolo a usar' })
  @ApiQuery({ name: 'count', description: 'Número de mensagens a simular', required: false })
  async simulateSensorData(
    @Query('sensorId') sensorId: string,
    @Query('protocol') protocol: 'mqtt' | 'http' = 'mqtt',
    @Query('count') count?: number,
  ) {
    if (!sensorId) {
      return { error: 'sensorId is required' };
    }

    return this.iotGateway.simulateSensorData(sensorId, { protocol, count: count || 1 });
  }

  @Get('test/echo')
  @Roles(UserRole.ADMIN)
  @UseGuards(DevOnlyGuard)
  @ApiOperation({
    summary: 'Echo test endpoint',
    description: 'Endpoint de teste para verificar conectividade do gateway (apenas desenvolvimento)',
  })
  @ApiResponse({ status: 200, description: 'Echo realizado com sucesso' })
  @ApiQuery({ name: 'message', description: 'Mensagem para echo', required: false })
  async echoTest(@Query('message') message: string = 'Hello IoT Gateway!') {
    this.logger.debug(`Echo test: ${message}`);

    return {
      message,
      timestamp: new Date().toISOString(),
      gateway: 'flowback-iiot-gateway',
      version: '1.0.0',
      status: 'operational',
    };
  }
}
