# Reports Module

## 📊 Visão Geral

O módulo de relatórios fornece um sistema completo para geração de relatórios exportáveis em PDF, Excel e CSV. Permite analisar dados históricos, gerar insights e criar documentação profissional para stakeholders.

## 🏗️ Componentes

### 1. ReportsService
- **Orquestração**: Coordena geração de relatórios
- **Validação**: Verifica parâmetros e permissões
- **Agendamento**: Relatórios automáticos e recorrentes
- **Métricas**: Estatísticas de uso e performance

### 2. ReportDataService
- **Coleta de Dados**: Busca e processa dados do banco
- **Agregação**: Estatísticas e métricas calculadas
- **Filtragem**: Aplicação de filtros avançados
- **Formatação**: Preparação para diferentes formatos

### 3. PdfReportService
- **Geração PDF**: Usa Puppeteer para HTML para PDF
- **Templates**: Handlebars para layouts customizáveis
- **Estilos**: CSS profissional e responsivo
- **Paginação**: Quebras automáticas de página

### 4. ExcelReportService
- **Planilhas**: Múltiplas abas por tipo de dado
- **Formatação**: Estilos, cores e formatação condicional
- **Fórmulas**: Cálculos automáticos em células
- **Gráficos**: Preparação para gráficos do Excel

## 📋 Tipos de Relatório

### 1. Histórico de Níveis dos Tanques
- **Dados**: Leituras de nível por tanque
- **Período**: Personalizável
- **Métricas**: Média, mínimo, máximo, tendência
- **Filtros**: Por tanque específico

### 2. Performance dos Sensores
- **Dados**: Qualidade, erros, conectividade
- **Período**: Análise temporal
- **Métricas**: Taxa de erro, uptime, bateria
- **Filtros**: Por sensor ou tipo

### 3. Resumo de Alertas
- **Dados**: Todos os alertas do período
- **Análise**: Por tipo, severidade e status
- **Métricas**: Tempo de resolução, recorrência
- **Filtros**: Por tanque, sensor ou severidade

### 4. Visão Geral do Sistema
- **Dados**: Status geral de tanques e sensores
- **Dashboard**: Métricas consolidadas
- **Inventário**: Lista completa de equipamentos
- **Saúde**: Indicadores de performance

### 5. Cronograma de Manutenção
- **Dados**: Itens pendentes de manutenção
- **Priorização**: Por urgência e data limite
- **Agrupamento**: Por tanque e tipo de manutenção
- **Acompanhamento**: Histórico de intervenções

### 6. Análise de Produção
- **Dados**: Volumes e eficiência por tanque
- **Métricas**: Produção total, variações, tendências
- **Eficiência**: Comparação entre tanques
- **Período**: Análise temporal detalhada

## 🔧 Endpoints da API

### Geração de Relatórios

```http
POST /reports/generate
Content-Type: application/json

{
  "type": "tank_level_history",
  "format": "pdf",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-01-31T23:59:59Z",
  "tankIds": ["tank-001", "tank-002"],
  "title": "Relatório Customizado"
}
```

**Resposta**: Arquivo binário no formato solicitado

### Endpoints Específicos

```http
POST /reports/tank-level-history
POST /reports/sensor-performance
POST /reports/alert-summary
POST /reports/system-overview
POST /reports/maintenance-schedule
POST /reports/production-analysis
```

### Utilitários

```http
GET  /reports/available          # Lista tipos disponíveis
GET  /reports/preview            # Preview sem gerar
GET  /reports/stats              # Estatísticas de uso
POST /reports/scheduled/generate # Gerar agendados
```

## 🎯 Parâmetros de Geração

### Estrutura Básica

```typescript
interface GenerateReportDto {
  type: ReportType;           // Tipo do relatório
  format: ReportFormat;       // pdf | excel | csv
  startDate?: string;         // Data inicial (ISO 8601)
  endDate?: string;           // Data final (ISO 8601)
  tankIds?: string[];         // Filtro por tanques
  sensorIds?: string[];       // Filtro por sensores
  parameters?: object;        // Parâmetros específicos
  title?: string;             // Título customizado
}
```

### Validações

- **Período Máximo**: 90 dias para relatórios detalhados
- **Limite de Itens**: Máximo 50 tanques, 100 sensores
- **Formatos**: PDF, Excel (.xlsx), CSV
- **Tamanho**: Otimização automática para grandes datasets

## 📊 Estrutura dos Dados

### Relatório de Alertas

```json
{
  "metadata": {
    "title": "Resumo de Alertas",
    "generatedAt": "2024-01-15T10:30:00Z",
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    }
  },
  "summary": {
    "totalAlerts": 245,
    "activeAlerts": 12,
    "resolvedAlerts": 188,
    "criticalAlerts": 3,
    "avgResolutionTimeHours": 4.2
  },
  "data": [
    {
      "id": "alert-001",
      "type": "high_level",
      "severity": "medium",
      "title": "Nível Alto Detectado",
      "tankName": "Tanque A",
      "createdAt": "2024-01-15T08:30:00Z",
      "resolvedAt": "2024-01-15T12:00:00Z"
    }
  ]
}
```

### Relatório de Performance

```json
{
  "summary": {
    "totalSensors": 25,
    "onlineSensors": 22,
    "avgQuality": 94.5,
    "totalErrors": 45,
    "errorRate": 1.8
  },
  "data": [
    {
      "sensorId": "SENSOR-001",
      "sensorName": "Radar Principal",
      "totalReadings": 8640,
      "avgQuality": 96.2,
      "errorCount": 8,
      "isOnline": true,
      "batteryLevel": 85
    }
  ]
}
```

## 📈 Geração de Relatórios

### Processo de Geração

1. **Validação**: Parâmetros e permissões
2. **Coleta**: Busca de dados no banco
3. **Processamento**: Cálculos e agregações
4. **Formatação**: Aplicação de templates
5. **Exportação**: Geração do arquivo final

### Otimizações de Performance

- **Paginação**: Processamento em chunks
- **Cache**: Resultados frequentes em cache
- **Compressão**: Arquivos otimizados
- **Background**: Processamento assíncrono

### Templates Personalizáveis

#### Template Handlebars (PDF)
```handlebars
<div class="header">
    <h1 class="title">{{metadata.title}}</h1>
    <p class="subtitle">Período: {{formatDate metadata.period.start}}</p>
</div>

<table class="table">
    {{#each data}}
        <tr>
            <td>{{sensorName}}</td>
            <td>{{formatNumber avgQuality}}%</td>
            <td>{{errorCount}}</td>
        </tr>
    {{/each}}
</table>
```

#### Planilha Excel
- **Múltiplas Abas**: Dados, resumo, gráficos
- **Formatação**: Cores, bordas, alinhamento
- **Fórmulas**: Cálculos automáticos
- **Congelamento**: Cabeçalhos fixos

## 📅 Agendamento de Relatórios

### Relatórios Automáticos

```typescript
// Diários - Alertas
@Cron(CronExpression.EVERY_DAY_AT_6AM)
async generateDailyAlertReport() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  await this.generateReport({
    type: ReportType.ALERT_SUMMARY,
    format: ReportFormat.PDF,
    startDate: yesterday.toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    title: `Relatório Diário de Alertas - ${yesterday.toLocaleDateString('pt-BR')}`
  });
}

// Semanais - Performance
@Cron(CronExpression.EVERY_WEEK)
async generateWeeklyPerformanceReport() {
  // Lógica para relatório semanal
}
```

### Configuração de Agendamento

- **Frequência**: Diária, semanal, mensal
- **Destinatários**: Lista de emails
- **Formatos**: Automático por tipo
- **Armazenamento**: Histórico de relatórios

## 🔐 Controle de Acesso

### Papéis e Permissões

| Operação | Admin | Operator | Maintenance |
|----------|-------|----------|-------------|
| Gerar relatório | ✅ | ✅ | ❌ |
| Relatórios agendados | ✅ | ❌ | ❌ |
| Preview | ✅ | ✅ | ✅ |
| Estatísticas | ✅ | ❌ | ❌ |

### Validações de Segurança

- **Limites de Dados**: Controle de volume
- **Rate Limiting**: Proteção contra abuso
- **Auditoria**: Log de todas as gerações
- **Permissões**: Validação de acesso aos dados

## 📊 Métricas e Monitoramento

### Indicadores de Performance

- **Tempo de Geração**: Média por tipo de relatório
- **Taxa de Sucesso**: Percentual de gerações bem-sucedidas
- **Uso de Recursos**: CPU, memória, disco
- **Satisfação**: Feedback dos usuários

### Monitoramento em Tempo Real

```json
{
  "reportsGenerated": 1250,
  "avgGenerationTime": 4500,
  "successRate": 98.5,
  "byType": {
    "alert_summary": 450,
    "sensor_performance": 380,
    "tank_level_history": 420
  },
  "byFormat": {
    "pdf": 780,
    "excel": 370,
    "csv": 100
  }
}
```

## 🧪 Testes e Qualidade

### Cenários de Teste

- ✅ Geração com dados vazios
- ✅ Relatórios com grandes volumes
- ✅ Templates malformados
- ✅ Conexões de banco instáveis
- ✅ Permissões insuficientes
- ✅ Parâmetros inválidos

### Testes de Performance

- **Carga**: 100 relatórios simultâneos
- **Volume**: 1M de registros
- **Tempo**: Geração em < 30 segundos
- **Memória**: < 500MB de uso

## 🔄 Próximos Passos

1. **Dashboard de Relatórios** - Interface para visualizar relatórios
2. **Compartilhamento** - Sistema de compartilhamento de relatórios
3. **Agendamento Avançado** - Interface web para configurar agendamentos
4. **Integração com BI** - Conectores para ferramentas de BI
5. **Machine Learning** - Insights automáticos nos relatórios

## 📋 Casos de Uso

### 1. Relatório Executivo
```typescript
// Relatório semanal para diretoria
const report = await generateReport({
  type: 'system_overview',
  format: 'pdf',
  title: 'Relatório Executivo - Semana ' + weekNumber,
  parameters: { includeCharts: true }
});
```

### 2. Análise de Manutenção
```typescript
// Cronograma de manutenções pendentes
const maintenance = await generateReport({
  type: 'maintenance_schedule',
  format: 'excel',
  title: 'Manutenções - Janeiro 2024'
});
```

### 3. Relatório de Incidentes
```typescript
// Análise detalhada de alertas críticos
const alerts = await generateReport({
  type: 'alert_summary',
  format: 'pdf',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  parameters: { criticalOnly: true }
});
```

### 4. Análise de Produção
```typescript
// Eficiência de produção mensal
const production = await generateReport({
  type: 'production_analysis',
  format: 'excel',
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z'
});
```

## 🚀 Deployment e Escalabilidade

### Configuração de Produção

```yaml
# docker-compose.prod.yml
services:
  reports-worker:
    build: ./backend
    environment:
      - REPORTS_MAX_CONCURRENT=5
      - REPORTS_TIMEOUT=300000
      - PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
    volumes:
      - ./reports:/app/reports
```

### Otimizações

- **Worker Pool**: Processamento paralelo
- **Cache**: Templates e dados frequentes
- **Compressão**: Arquivos reduzidos
- **CDN**: Distribuição de relatórios

---

**O sistema de relatórios está 100% funcional e pronto para gerar documentação profissional em PDF e Excel! 📊**
