import { Injectable, Logger } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ReportType } from '../dto/generate-report.dto';

interface ReportData {
  metadata: {
    title: string;
    generatedAt: Date;
    period: {
      start: Date;
      end: Date;
    };
    filters: any;
  };
  summary: any;
  data: any;
  charts?: any;
}

@Injectable()
export class ExcelReportService {
  private readonly logger = new Logger(ExcelReportService.name);

  async generateExcel(type: ReportType, data: ReportData): Promise<Buffer> {
    try {
      this.logger.log(`Gerando Excel para relatório: ${type}`);

      const workbook = XLSX.utils.book_new();

      // Adicionar planilha de resumo
      this.addSummarySheet(workbook, data);

      // Adicionar planilhas de dados específicas do tipo
      switch (type) {
        case ReportType.TANK_LEVEL_HISTORY:
          this.addTankLevelHistorySheets(workbook, data);
          break;
        case ReportType.SENSOR_PERFORMANCE:
          this.addSensorPerformanceSheets(workbook, data);
          break;
        case ReportType.ALERT_SUMMARY:
          this.addAlertSummarySheets(workbook, data);
          break;
        case ReportType.SYSTEM_OVERVIEW:
          this.addSystemOverviewSheets(workbook, data);
          break;
        case ReportType.MAINTENANCE_SCHEDULE:
          this.addMaintenanceScheduleSheets(workbook, data);
          break;
        case ReportType.PRODUCTION_ANALYSIS:
          this.addProductionAnalysisSheets(workbook, data);
          break;
      }

      // Gerar buffer do arquivo
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      this.logger.log(`Excel gerado com sucesso: ${data.metadata.title}`);

      return buffer;
    } catch (error) {
      this.logger.error(`Erro ao gerar Excel para ${type}:`, error);
      throw error;
    }
  }

  private addSummarySheet(workbook: XLSX.WorkBook, data: ReportData): void {
    const summaryData: any[][] = [
      ['Relatório', data.metadata.title],
      ['Gerado em', this.formatDate(data.metadata.generatedAt)],
      ['Período Inicial', this.formatDate(data.metadata.period.start)],
      ['Período Final', this.formatDate(data.metadata.period.end)],
      [''],
      ['RESUMO'],
    ];

    // Adicionar dados do summary
    if (data.summary) {
      summaryData.push(['']);
      Object.entries(data.summary).forEach(([key, value]) => {
        summaryData.push([this.formatKey(key), value]);
      });
    }

    const worksheet = XLSX.utils.aoa_to_sheet(summaryData);

    // Aplicar estilos básicos
    this.applyBasicStyles(worksheet, summaryData.length);

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumo');
  }

  private addTankLevelHistorySheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    if (!data.data || !Array.isArray(data.data)) return;

    // Planilha principal de dados
    const headers = [
      'ID do Tanque',
      'Nome do Tanque',
      'Código',
      'Total de Leituras',
      'Nível Médio',
      'Nível Mínimo',
      'Nível Máximo',
    ];

    const tankData = data.data.map((tank) => [
      tank.tankId,
      tank.tankName,
      tank.tankCode,
      tank.totalReadings,
      this.formatNumber(tank.avgLevel),
      this.formatNumber(tank.minLevel),
      this.formatNumber(tank.maxLevel),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...tankData]);
    this.applyDataTableStyles(worksheet, tankData.length + 1);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tanques');

    // Planilha detalhada de leituras (se houver dados suficientes)
    if (data.data.length > 0 && data.data[0].readings) {
      data.data.forEach((tank) => {
        if (tank.readings && tank.readings.length > 0) {
          const readingsHeaders = ['Timestamp', 'Nível', 'Volume', 'Qualidade'];

          const readingsData = tank.readings.map((reading) => [
            this.formatDate(new Date(reading.timestamp)),
            this.formatNumber(reading.level),
            reading.volume ? this.formatNumber(reading.volume) : 'N/A',
            reading.quality || 'N/A',
          ]);

          const readingsSheet = XLSX.utils.aoa_to_sheet([
            readingsHeaders,
            ...readingsData,
          ]);
          this.applyDataTableStyles(readingsSheet, readingsData.length + 1);
          XLSX.utils.book_append_sheet(
            workbook,
            readingsSheet,
            `Leituras_${tank.tankCode}`,
          );
        }
      });
    }
  }

  private addSensorPerformanceSheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    if (!data.data || !Array.isArray(data.data)) return;

    const headers = [
      'ID do Sensor',
      'Nome do Sensor',
      'Tipo',
      'Tanque',
      'Total de Leituras',
      'Qualidade Média (%)',
      'Erros',
      'Taxa de Erro (%)',
      'Transmissões',
      'Online',
      'Bateria (%)',
      'Última Transmissão',
    ];

    const sensorData = data.data.map((sensor) => [
      sensor.sensorId,
      sensor.sensorName,
      this.formatSensorType(sensor.sensorType),
      sensor.tankName,
      sensor.totalReadings,
      this.formatNumber(sensor.avgQuality),
      sensor.errorCount,
      this.formatNumber(sensor.errorRate),
      sensor.transmissionCount,
      sensor.isOnline ? 'Sim' : 'Não',
      sensor.batteryLevel || 'N/A',
      sensor.lastTransmission
        ? this.formatDate(sensor.lastTransmission)
        : 'Nunca',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...sensorData]);
    this.applyDataTableStyles(worksheet, sensorData.length + 1);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sensores');
  }

  private addAlertSummarySheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    if (!data.data || !Array.isArray(data.data)) return;

    const headers = [
      'ID',
      'Tipo',
      'Severidade',
      'Título',
      'Status',
      'Tanque',
      'Sensor',
      'Criado em',
      'Reconhecido em',
      'Resolvido em',
      'Nível Atual',
      'Volume Atual',
      'Limite',
    ];

    const alertData = data.data.map((alert) => [
      alert.id,
      this.formatAlertType(alert.type),
      this.formatSeverity(alert.severity),
      alert.title,
      this.formatAlertStatus(alert.status),
      alert.tankName,
      alert.sensorName,
      this.formatDate(new Date(alert.createdAt)),
      alert.acknowledgedAt
        ? this.formatDate(new Date(alert.acknowledgedAt))
        : '',
      alert.resolvedAt ? this.formatDate(new Date(alert.resolvedAt)) : '',
      alert.currentLevel ? this.formatNumber(alert.currentLevel) : '',
      alert.currentVolume ? this.formatNumber(alert.currentVolume) : '',
      alert.thresholdValue ? this.formatNumber(alert.thresholdValue) : '',
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...alertData]);
    this.applyDataTableStyles(worksheet, alertData.length + 1);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Alertas');
  }

  private addSystemOverviewSheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    // Planilha de tanques
    if (data.data?.tanks && Array.isArray(data.data.tanks)) {
      const tankHeaders = [
        'ID',
        'Nome',
        'Código',
        'Status',
        'Qtd. Sensores',
        'Latitude',
        'Longitude',
      ];

      const tankData = data.data.tanks.map((tank) => [
        tank.id,
        tank.name,
        tank.code,
        this.formatTankStatus(tank.status),
        tank.sensorCount,
        tank.latitude,
        tank.longitude,
      ]);

      const tankSheet = XLSX.utils.aoa_to_sheet([tankHeaders, ...tankData]);
      this.applyDataTableStyles(tankSheet, tankData.length + 1);
      XLSX.utils.book_append_sheet(workbook, tankSheet, 'Tanques');
    }

    // Planilha de sensores
    if (data.data?.sensors && Array.isArray(data.data.sensors)) {
      const sensorHeaders = [
        'ID',
        'Nome',
        'Tipo',
        'Tanque',
        'Status',
        'Online',
        'Bateria (%)',
        'Última Transmissão',
      ];

      const sensorData = data.data.sensors.map((sensor) => [
        sensor.id,
        sensor.name,
        this.formatSensorType(sensor.type),
        sensor.tankName,
        this.formatSensorStatus(sensor.status),
        sensor.isOnline ? 'Sim' : 'Não',
        sensor.batteryLevel || 'N/A',
        sensor.lastTransmission
          ? this.formatDate(sensor.lastTransmission)
          : 'Nunca',
      ]);

      const sensorSheet = XLSX.utils.aoa_to_sheet([
        sensorHeaders,
        ...sensorData,
      ]);
      this.applyDataTableStyles(sensorSheet, sensorData.length + 1);
      XLSX.utils.book_append_sheet(workbook, sensorSheet, 'Sensores');
    }
  }

  private addMaintenanceScheduleSheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    if (!data.data) return;

    // Planilha de tanques
    if (data.data.tanks && Array.isArray(data.data.tanks)) {
      const tankHeaders = [
        'ID',
        'Nome',
        'Código',
        'Tipo',
        'Prioridade',
        'Última Manutenção',
        'Próxima Manutenção',
        'Descrição',
      ];

      const tankData = data.data.tanks.map((tank) => [
        tank.id,
        tank.name,
        tank.code,
        'Tanque',
        tank.priority,
        tank.lastMaintenance ? this.formatDate(tank.lastMaintenance) : 'Nunca',
        tank.nextMaintenance
          ? this.formatDate(tank.nextMaintenance)
          : 'Pendente',
        tank.description,
      ]);

      const tankSheet = XLSX.utils.aoa_to_sheet([tankHeaders, ...tankData]);
      this.applyDataTableStyles(tankSheet, tankData.length + 1);
      XLSX.utils.book_append_sheet(workbook, tankSheet, 'Manutenção_Tanques');
    }

    // Planilha de sensores
    if (data.data.sensors && Array.isArray(data.data.sensors)) {
      const sensorHeaders = [
        'ID',
        'Nome',
        'Tanque',
        'Tipo',
        'Prioridade',
        'Última Manutenção',
        'Próxima Manutenção',
        'Bateria (%)',
        'Descrição',
      ];

      const sensorData = data.data.sensors.map((sensor) => [
        sensor.id,
        sensor.name,
        sensor.tankName,
        sensor.type,
        sensor.priority,
        sensor.lastMaintenance
          ? this.formatDate(sensor.lastMaintenance)
          : 'Nunca',
        sensor.nextMaintenance
          ? this.formatDate(sensor.nextMaintenance)
          : 'Pendente',
        sensor.batteryLevel || 'N/A',
        sensor.description,
      ]);

      const sensorSheet = XLSX.utils.aoa_to_sheet([
        sensorHeaders,
        ...sensorData,
      ]);
      this.applyDataTableStyles(sensorSheet, sensorData.length + 1);
      XLSX.utils.book_append_sheet(
        workbook,
        sensorSheet,
        'Manutenção_Sensores',
      );
    }
  }

  private addProductionAnalysisSheets(
    workbook: XLSX.WorkBook,
    data: ReportData,
  ): void {
    if (!data.data || !Array.isArray(data.data)) return;

    const headers = [
      'ID do Tanque',
      'Nome do Tanque',
      'Total de Leituras',
      'Volume Total',
      'Volume Médio',
      'Volume Mínimo',
      'Volume Máximo',
      'Variação de Volume',
      'Eficiência (%)',
    ];

    const productionData = data.data.map((tank) => [
      tank.tankId,
      tank.tankName,
      tank.totalReadings,
      tank.totalVolume,
      tank.avgVolume,
      tank.minVolume,
      tank.maxVolume,
      tank.volumeVariation,
      tank.efficiency,
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...productionData]);
    this.applyDataTableStyles(worksheet, productionData.length + 1);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Análise_Produção');
  }

  private applyBasicStyles(worksheet: XLSX.WorkSheet, _rowCount: number): void {
    // Definir larguras das colunas
    worksheet['!cols'] = [
      { wch: 20 }, // Coluna A
      { wch: 30 }, // Coluna B
    ];

    // Aplicar estilos básicos (se suportado pela biblioteca)
    if (worksheet['!margins']) {
      worksheet['!margins'] = {
        left: 0.7,
        right: 0.7,
        top: 0.75,
        bottom: 0.75,
        header: 0.3,
        footer: 0.3,
      };
    }
  }

  private applyDataTableStyles(
    worksheet: XLSX.WorkSheet,
    _rowCount: number,
  ): void {
    // Definir larguras das colunas automaticamente
    const columnWidths: { wch: number }[] = [];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

    for (let col = range.s.c; col <= range.e.c; col++) {
      let maxLength = 10; // Largura mínima

      for (let row = range.s.r; row <= range.e.r; row++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = worksheet[cellAddress];

        if (cell && cell.v) {
          const cellValue = String(cell.v);
          maxLength = Math.max(maxLength, cellValue.length);
        }
      }

      columnWidths.push({ wch: Math.min(maxLength + 2, 50) }); // Máximo 50 caracteres
    }

    worksheet['!cols'] = columnWidths;

    // Congelar a primeira linha (cabeçalho)
    worksheet['!freeze'] = 'A2';
  }

  private formatDate(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  }

  private formatNumber(num: number, decimals: number = 2): string {
    return num.toFixed(decimals).replace('.', ',');
  }

  private formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .trim();
  }

  private formatSensorType(type: string): string {
    const types = {
      magnetostrictive: 'Haste magnetostritiva',
      radar_level: 'Radar Nível',
      float_switch: 'Boia',
      ultrasonic: 'Ultrassônico',
      pressure: 'Pressão',
      capacitive: 'Capacitivo',
    };
    return types[type] || type;
  }

  private formatAlertType(type: string): string {
    const types = {
      high_level: 'Nível Alto',
      low_level: 'Nível Baixo',
      overflow_risk: 'Risco de Transbordo',
      sensor_offline: 'Sensor Offline',
      battery_low: 'Bateria Baixa',
      sensor_error: 'Erro no Sensor',
      maintenance_due: 'Manutenção Vencida',
      calibration_due: 'Calibração Vencida',
      communication_error: 'Erro de Comunicação',
      power_failure: 'Falha de Energia',
    };
    return types[type] || type;
  }

  private formatSeverity(severity: string): string {
    const severities = {
      critical: 'Crítico',
      high: 'Alto',
      medium: 'Médio',
      low: 'Baixo',
    };
    return severities[severity] || severity;
  }

  private formatAlertStatus(status: string): string {
    const statuses = {
      active: 'Ativo',
      acknowledged: 'Reconhecido',
      resolved: 'Resolvido',
      false_positive: 'Falso Positivo',
    };
    return statuses[status] || status;
  }

  private formatTankStatus(status: string): string {
    const statuses = {
      active: 'Ativo',
      maintenance: 'Manutenção',
      inactive: 'Inativo',
      error: 'Erro',
    };
    return statuses[status] || status;
  }

  private formatSensorStatus(status: string): string {
    const statuses = {
      active: 'Ativo',
      inactive: 'Inativo',
      maintenance: 'Manutenção',
      error: 'Erro',
      offline: 'Offline',
    };
    return statuses[status] || status;
  }
}
