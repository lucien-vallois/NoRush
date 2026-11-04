import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PredictionsService, TankForecast } from './predictions.service';

@ApiTags('Predictions')
@Controller('predictions')
export class PredictionsController {
  constructor(private readonly predictionsService: PredictionsService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Previsões de nível para todos os tanques ativos',
    description:
      'Regressão do ritmo de enchimento sobre os agregados de 5min (TimescaleDB): tendência, ETA até os limites e confiança (R²)',
  })
  @ApiResponse({ status: 200, description: 'Previsões obtidas com sucesso' })
  async getAll(): Promise<TankForecast[]> {
    return this.predictionsService.computeAllForecasts();
  }

  @Get(':tankId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Previsão de nível para um tanque' })
  @ApiResponse({ status: 200, description: 'Previsão obtida com sucesso' })
  @ApiParam({ name: 'tankId', description: 'ID do tanque' })
  async getOne(@Param('tankId') tankId: string): Promise<TankForecast | null> {
    return this.predictionsService.computeForecastForTank(tankId);
  }
}
