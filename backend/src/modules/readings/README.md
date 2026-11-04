# Readings Module

## 📊 Visão Geral

O módulo de leituras gerencia todos os dados coletados pelos sensores IoT. Fornece funcionalidades completas de armazenamento, consulta, análise estatística e processamento de dados históricos.

## 🏗️ Componentes

### 1. ReadingsService
- **CRUD completo**: Criar, ler, atualizar e consultar leituras
- **Filtros avançados**: Por sensor, tanque, período, nível, volume
- **Estatísticas**: Análises detalhadas e tendências
- **Agregação**: Dados horários e diários
- **Manutenção**: Limpeza e recalculo de volumes

### 2. ReadingsController
- **REST API**: Endpoints para todas as operações
- **Documentação**: Swagger/OpenAPI automática
- **Paginação**: Suporte a paginação e limites
- **Filtros**: Parâmetros de consulta flexíveis

### 3. DTOs
- **CreateReadingDto**: Validação para criação
- **ReadingFiltersDto**: Filtros de busca avançados

## 📈 Funcionalidades

### Armazenamento de Dados
- ✅ Armazenamento otimizado de leituras
- ✅ Conversão automática nível-volume
- ✅ Metadados e qualidade da medição
- ✅ Timestamps precisos e zonas horárias

### Consultas Avançadas
- ✅ Filtros por sensor, tanque e período
- ✅ Paginação e ordenação flexível
- ✅ Últimas leituras em tempo real
- ✅ Busca histórica detalhada

### Análise Estatística
- ✅ Estatísticas resumidas (mín, máx, média)
- ✅ Distribuição de qualidade
- ✅ Tendências de nível/volume
- ✅ Agregados horários/diários

### Processamento de Dados
- ✅ Recálculo de volumes
- ✅ Limpeza de dados antigos
- ✅ Validação de consistência
- ✅ Correção de anomalias

## 🔧 Endpoints da API

### CRUD Básico

```http
POST   /readings                    # Criar leitura
GET    /readings                    # Listar leituras (com filtros)
GET    /readings/:id                # Obter leitura por ID
```

### Consultas por Entidade

```http
GET    /readings/sensor/:sensorId   # Leituras de um sensor
GET    /readings/tank/:tankId       # Leituras de um tanque
```

### Últimas Leituras

```http
GET    /readings/sensor/:sensorId/latest?limit=10   # Últimas de sensor
GET    /readings/tank/:tankId/latest?limit=10       # Últimas de tanque
```

### Estatísticas

```http
GET    /readings/sensor/:sensorId/stats             # Stats de sensor
GET    /readings/tank/:tankId/stats                 # Stats de tanque
GET    /readings/global/stats                       # Stats globais
```

### Agregados Temporais

```http
GET    /readings/sensor/:sensorId/hourly?hours=24   # Horários de sensor
GET    /readings/tank/:tankId/hourly?hours=24       # Horários de tanque
GET    /readings/global/hourly?hours=24             # Horários globais
```

### Manutenção

```http
POST   /readings/maintenance/recalculate-volumes    # Recalcular volumes
POST   /readings/maintenance/cleanup                # Limpar dados antigos
```

## 🎯 Filtros de Busca

### Parâmetros Disponíveis

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `sensorId` | UUID | ID do sensor |
| `tankId` | UUID | ID do tanque |
| `startDate` | Date | Data inicial (ISO 8601) |
| `endDate` | Date | Data final (ISO 8601) |
| `minLevel` | Number | Nível mínimo |
| `maxLevel` | Number | Nível máximo |
| `minVolume` | Number | Volume mínimo |
| `maxVolume` | Number | Volume máximo |
| `minQuality` | Number | Qualidade mínima (0-100%) |
| `calibratedOnly` | Boolean | Apenas calibradas |
| `processedOnly` | Boolean | Apenas processadas |
| `limit` | Number | Limite de resultados (1-1000) |
| `page` | Number | Página (para paginação) |
| `sortBy` | String | Ordenação (timestamp, level, volume, quality) |
| `sortOrder` | String | Direção (ASC, DESC) |

### Exemplos de Uso

```bash
# Leituras de hoje de um sensor específico
GET /readings?sensorId=550e8400-e29b-41d4-a716-446655440000&startDate=2024-01-15T00:00:00Z

# Leituras de alta qualidade de um tanque
GET /readings?tankId=550e8400-e29b-41d4-a716-446655440001&minQuality=80&limit=50

# Leituras recentes com paginação
GET /readings?startDate=2024-01-14T00:00:00Z&page=1&limit=100&sortBy=timestamp&sortOrder=DESC

# Leituras com nível crítico
GET /readings?minLevel=4.0&maxLevel=5.0&startDate=2024-01-10T00:00:00Z
```

## 📋 Estrutura dos Dados

### Reading Entity

```typescript
{
  id: string;                    // UUID único
  sensorId: string;              // Sensor que fez a leitura
  level: number;                 // Nível em metros
  volume: number;                // Volume calculado em litros
  oilWaterInterface?: {          // Interface óleo-água
    oilLevel: number;
    waterLevel: number;
    interfaceLevel: number;
  };
  metadata?: {                   // Dados adicionais
    signalStrength?: number;
    temperature?: number;
    humidity?: number;
    pressure?: number;
    rawData?: any;
  };
  quality: number;               // Qualidade 0-100%
  isCalibrated: boolean;         // Foi calibrada
  isProcessed: boolean;          // Foi processada
  timestamp: Date;               // Quando foi medida
  processedAt: Date;             // Quando foi processada
  createdAt: Date;               // Quando foi criada
}
```

### Criação de Leitura

```json
{
  "sensorId": "550e8400-e29b-41d4-a716-446655440000",
  "level": 3.45,
  "volume": 2450.50,
  "oilWaterInterface": {
    "oilLevel": 2.5,
    "waterLevel": 1.2,
    "interfaceLevel": 2.1
  },
  "metadata": {
    "signalStrength": -45,
    "temperature": 25.5,
    "humidity": 65.0
  },
  "quality": 95,
  "isCalibrated": true,
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## 📊 Estatísticas e Análises

### Estatísticas Resumidas

```json
{
  "summary": {
    "totalReadings": 15420,
    "avgLevel": 2.34,
    "minLevel": 0.15,
    "maxLevel": 4.85,
    "avgVolume": 1650.50,
    "minVolume": 100.00,
    "maxVolume": 3400.00,
    "avgQuality": 92.5,
    "firstReading": "2024-01-01T00:00:00Z",
    "lastReading": "2024-01-15T10:30:00Z"
  },
  "trend": {
    "trend": "rising",
    "changePercent": 12.5,
    "firstHalfAvg": 2.1,
    "secondHalfAvg": 2.36
  },
  "qualityDistribution": {
    "average": 92.5,
    "minimum": 75,
    "maximum": 100,
    "distribution": {
      "excellent": 60,
      "good": 30,
      "fair": 8,
      "poor": 2
    }
  }
}
```

### Agregados Horários

```json
[
  {
    "hour": "2024-01-15T10:00:00Z",
    "avgLevel": 2.34,
    "minLevel": 2.1,
    "maxLevel": 2.6,
    "avgVolume": 1650.50,
    "readingCount": 60
  },
  {
    "hour": "2024-01-15T11:00:00Z",
    "avgLevel": 2.42,
    "minLevel": 2.2,
    "maxLevel": 2.7,
    "avgVolume": 1700.00,
    "readingCount": 60
  }
]
```

## 🔄 Processamento de Dados

### Conversão Nível-Volume

O sistema automaticamente converte níveis em volumes usando:

1. **Tabela de Arqueação**: Conversão precisa baseada em calibração
2. **Fórmula Geométrica**: Aproximação para tanques cilíndricos
3. **Recálculo**: Atualização de volumes quando necessário

```typescript
// Exemplo de cálculo de volume
const volume = tank.getVolumeFromLevel(level);
// Retorna volume em litros baseado na tabela de arqueação
```

### Validação de Qualidade

- **Sinal**: Intensidade do sinal do sensor
- **Consistência**: Verificação de dados internos
- **Calibração**: Leituras calibradas vs não calibradas
- **Anomalias**: Detecção de valores fora do esperado

## 🧹 Manutenção de Dados

### Limpeza Automática

```http
POST /readings/maintenance/cleanup?daysToKeep=90
```

Remove leituras antigas mantendo apenas os últimos N dias.

### Recálculo de Volumes

```http
POST /readings/maintenance/recalculate-volumes?sensorId=...
```

Recalcula volumes para leituras que:
- Não têm volume calculado
- Precisam ser reprocessadas
- Tiveram mudanças na tabela de arqueação

## 📈 Performance e Otimização

### Índices de Banco

```sql
-- Índices para consultas rápidas
CREATE INDEX idx_readings_sensor_timestamp ON readings(sensorId, timestamp);
CREATE INDEX idx_readings_timestamp ON readings(timestamp);
CREATE INDEX idx_readings_sensor_quality ON readings(sensorId, quality);
```

### Estratégias de Otimização

1. **Paginação**: Limitação de resultados
2. **Índices**: Consultas otimizadas
3. **Cache**: Resultados frequentes em cache
4. **Compressão**: Dados históricos comprimidos
5. **Particionamento**: Tabelas particionadas por data

## 🔐 Controle de Acesso

### Papéis e Permissões

| Operação | Admin | Operator | Maintenance |
|----------|-------|----------|-------------|
| Criar leitura | ✅ | ❌ | ✅ |
| Consultar leituras | ✅ | ✅ | ✅ |
| Ver estatísticas | ✅ | ✅ | ✅ |
| Manutenção | ✅ | ❌ | ✅ |

## 📊 Métricas de Monitoramento

### Indicadores Principais

- **Throughput**: Leituras processadas por segundo
- **Latência**: Tempo médio de processamento
- **Qualidade**: Percentual de leituras de alta qualidade
- **Armazenamento**: Volume de dados históricos
- **Disponibilidade**: Uptime do serviço

### Alertas Automáticos

- Taxa de processamento abaixo do esperado
- Qualidade média abaixo de 80%
- Volume de armazenamento crítico
- Latência acima de 500ms
- Erros consecutivos de processamento

## 🧪 Testes e Validação

### Cenários de Teste

- ✅ Criação com dados válidos
- ✅ Validação de campos obrigatórios
- ✅ Conversão nível-volume
- ✅ Filtros e paginação
- ✅ Estatísticas e agregados
- ✅ Operações de manutenção

### Dados de Teste

```bash
# Gerar dados de teste
npm run iot:simulate:mqtt

# Verificar processamento
curl http://localhost:3000/readings/global/stats

# Testar filtros
curl "http://localhost:3000/readings?sensorId=TEST-001&limit=5"
```

## 🔄 Próximos Passos

1. **Time Series Database** - Migração para InfluxDB/ TimescaleDB
2. **Real-time Analytics** - Análises em tempo real com Kafka
3. **Machine Learning** - Detecção de anomalias com ML
4. **Data Compression** - Compressão automática de dados antigos
5. **Edge Processing** - Processamento na borda da rede

## 📋 Troubleshooting

### Problemas Comuns

1. **Dados não aparecem**
   - Verificar se o sensorId existe
   - Confirmar timestamp no formato correto
   - Verificar conectividade com o banco

2. **Volumes incorretos**
   - Verificar tabela de arqueação do tanque
   - Confirmar se o sensor está associado ao tanque correto
   - Executar recalculo de volumes

3. **Consultas lentas**
   - Verificar índices do banco
   - Usar paginação adequada
   - Limitar período de consulta

### Logs de Debug

```bash
# Habilitar logs detalhados
DEBUG=readings:* npm run start:dev

# Verificar processamento
tail -f logs/readings-processor.log

# Monitorar consultas
tail -f logs/readings-queries.log
```

## 📊 Casos de Uso

### 1. Monitoramento em Tempo Real
```typescript
// Últimas leituras de um tanque
const readings = await getLatestByTank(tankId, 10);
// Exibe nível atual e tendência
```

### 2. Análise Histórica
```typescript
// Leituras dos últimos 30 dias
const filters = {
  tankId,
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  limit: 1000
};
const history = await findAll(filters);
```

### 3. Alertas de Nível
```typescript
// Verificar se nível está crítico
const stats = await getReadingStats(sensorId);
if (stats.summary.avgLevel > criticalLevel) {
  // Disparar alerta
}
```

### 4. Relatórios de Produção
```typescript
// Agregados diários para relatório
const hourly = await getHourlyAggregates(sensorId, 168); // 7 dias
// Calcular produção média, picos, etc.
```
