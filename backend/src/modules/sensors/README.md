# Sensors Module

## 📡 Visão Geral

O módulo de sensores gerencia todos os dispositivos IoT conectados ao sistema Flowback. Fornece funcionalidades completas de CRUD, monitoramento em tempo real, manutenção e calibração de sensores.

## 🏗️ Componentes

### 1. SensorsService
- **CRUD completo**: Criar, ler, atualizar e deletar sensores
- **Filtros avançados**: Por tipo, status, tanque, bateria, etc.
- **Manutenção**: Calibração e atualização de firmware
- **Estatísticas**: Métricas detalhadas de performance
- **Operações em lote**: Atualização massiva de status

### 2. SensorsController
- **REST API**: Endpoints completos para todas as operações
- **Documentação**: Swagger/OpenAPI automática
- **Validação**: DTOs com validação automática
- **Autorização**: Controle de acesso baseado em papéis

### 3. DTOs
- **CreateSensorDto**: Validação para criação
- **UpdateSensorDto**: Validação para atualização
- **SensorFiltersDto**: Filtros de busca avançados

## 📊 Funcionalidades

### Gerenciamento Básico
- ✅ Cadastro de sensores com validação completa
- ✅ Atualização de configurações e metadados
- ✅ Controle de status (ativo/inativo/manutenção)
- ✅ Associação com tanques específicos

### Monitoramento Avançado
- ✅ Status online/offline em tempo real
- ✅ Monitoramento de bateria e conectividade
- ✅ Estatísticas de transmissão e performance
- ✅ Alertas de manutenção e calibração

### Manutenção e Calibração
- ✅ Rastreamento de datas de calibração
- ✅ Controle de versão de firmware
- ✅ Alertas de manutenção preventiva
- ✅ Histórico de intervenções

## 🔧 Endpoints da API

### CRUD Básico

```http
POST   /sensors                    # Criar sensor
GET    /sensors                    # Listar sensores (com filtros)
GET    /sensors/:id                # Obter sensor por ID
GET    /sensors/by-sensor-id/:id   # Obter por sensorId
PATCH  /sensors/:id                # Atualizar sensor
DELETE /sensors/:id                # Deletar sensor
```

### Monitoramento

```http
GET    /sensors/dashboard          # Dashboard geral
GET    /sensors/online             # Sensores online
GET    /sensors/maintenance-needed # Precisam manutenção
GET    /sensors/low-battery        # Bateria baixa
GET    /sensors/:id/stats          # Estatísticas detalhadas
```

### Manutenção

```http
POST   /sensors/:id/calibration    # Registrar calibração
POST   /sensors/:id/firmware       # Atualizar firmware
```

### Agrupamento

```http
GET    /sensors/tank/:tankId       # Por tanque
GET    /sensors/type/:type         # Por tipo
GET    /sensors/status/:status     # Por status
```

### Operações em Lote

```http
POST   /sensors/bulk/status        # Atualizar status em lote
POST   /sensors/bulk/calibration   # Calibrar em lote
```

## 🎯 Filtros de Busca

### Parâmetros Disponíveis

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `type` | enum | Tipo do sensor (RADAR_LEVEL, FLOAT_SWITCH, etc.) |
| `protocol` | enum | Protocolo (MQTT, HTTP, MODBUS, LORAWAN) |
| `status` | enum | Status (ACTIVE, INACTIVE, MAINTENANCE, ERROR, OFFLINE) |
| `tankId` | UUID | ID do tanque associado |
| `model` | string | Modelo do sensor |
| `manufacturer` | string | Fabricante |
| `search` | string | Busca por nome ou sensorId |
| `onlineOnly` | boolean | Apenas sensores online |
| `needsCalibration` | boolean | Precisam calibração |
| `lowBattery` | boolean | Bateria baixa |

### Exemplos de Uso

```bash
# Sensores ativos de um tanque específico
GET /sensors?status=ACTIVE&tankId=550e8400-e29b-41d4-a716-446655440000

# Sensores online que precisam calibração
GET /sensors?onlineOnly=true&needsCalibration=true

# Busca por modelo e fabricante
GET /sensors?model=RL-1000&manufacturer=SensorTech

# Todos os sensores de radar com bateria baixa
GET /sensors?type=RADAR_LEVEL&lowBattery=true
```

## 📋 Estrutura dos Dados

### Sensor Entity

```typescript
{
  id: string;                    // UUID único
  sensorId: string;             // ID físico único
  name: string;                 // Nome descritivo
  type: SensorType;             // Tipo do sensor
  protocol: SensorProtocol;     // Protocolo de comunicação
  tankId: string;               // Tanque associado
  status: SensorStatus;         // Status atual

  // Metadados
  model?: string;
  manufacturer?: string;
  firmwareVersion?: string;

  // Configurações técnicas
  measurementRangeMin?: number;
  measurementRangeMax?: number;
  accuracy?: number;
  powerVoltage?: number;

  // Monitoramento
  batteryLevel?: number;
  lastTransmissionAt?: Date;
  transmissionCount: number;
  errorCount: number;

  // Manutenção
  installationDate?: Date;
  calibrationDate?: Date;
  nextCalibrationDate?: Date;

  // Configurações customizadas
  configuration?: Record<string, any>;
}
```

### Criação de Sensor

```json
{
  "sensorId": "SENSOR-001",
  "name": "Sensor de Nível - Tanque A",
  "type": "RADAR_LEVEL",
  "protocol": "MQTT",
  "tankId": "550e8400-e29b-41d4-a716-446655440000",
  "model": "RL-1000",
  "manufacturer": "SensorTech Industries",
  "measurementRangeMin": 0.1,
  "measurementRangeMax": 5.0,
  "accuracy": 0.01,
  "powerVoltage": 12.0,
  "installationDate": "2024-01-15",
  "configuration": {
    "updateInterval": 30,
    "averagingSamples": 10
  }
}
```

## 📊 Dashboard e Estatísticas

### Visão Geral

```json
{
  "overview": {
    "total": 25,
    "active": 22,
    "online": 20,
    "offline": 2,
    "maintenance": 3,
    "lowBattery": 1
  },
  "distribution": {
    "byType": {
      "RADAR_LEVEL": 15,
      "FLOAT_SWITCH": 8,
      "ULTRASONIC": 2
    },
    "byProtocol": {
      "MQTT": 20,
      "HTTP": 3,
      "MODBUS": 2
    }
  },
  "healthScore": 87
}
```

### Estatísticas Individuais

```json
{
  "sensor": {
    "id": "uuid",
    "sensorId": "SENSOR-001",
    "name": "Sensor Principal",
    "type": "RADAR_LEVEL",
    "status": "ACTIVE",
    "isOnline": true
  },
  "readings": {
    "totalReadings": 15420,
    "avgLevel": 2.34,
    "minLevel": 0.15,
    "maxLevel": 4.85,
    "firstReading": "2024-01-01T00:00:00Z",
    "lastReading": "2024-01-15T10:30:00Z"
  },
  "recentActivity": {
    "readingsLast24h": 2880,
    "lastTransmission": "2024-01-15T10:30:00Z",
    "transmissionCount": 15420
  },
  "battery": {
    "level": 85,
    "status": "good",
    "lastUpdate": "2024-01-15T10:30:00Z"
  },
  "maintenance": {
    "needsCalibration": false,
    "nextCalibrationDate": "2024-07-15T00:00:00Z",
    "lastCalibrationDate": "2024-01-15T00:00:00Z"
  }
}
```

## 🔧 Manutenção e Calibração

### Alertas de Manutenção

O sistema automaticamente identifica sensores que precisam de atenção:

- **Calibração**: Baseado na data da última calibração
- **Bateria**: Níveis abaixo de 20%
- **Offline**: Sem transmissão por mais de 5 minutos
- **Erros**: Contagem de erros de transmissão

### Processo de Calibração

```http
POST /sensors/:id/calibration
```

Este endpoint:
1. Registra a data atual como última calibração
2. Calcula a próxima calibração (6 meses à frente)
3. Atualiza o status do sensor
4. Registra no log de auditoria

### Atualização de Firmware

```http
POST /sensors/:id/firmware
Content-Type: application/json

{
  "firmwareVersion": "2.1.3"
}
```

## 🚀 Operações em Lote

### Atualização de Status

```http
POST /sensors/bulk/status
Content-Type: application/json

{
  "sensorIds": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ],
  "status": "MAINTENANCE"
}
```

### Calibração em Lote

```http
POST /sensors/bulk/calibration
Content-Type: application/json

{
  "sensorIds": [
    "uuid-1",
    "uuid-2",
    "uuid-3"
  ]
}
```

## 🔐 Controle de Acesso

### Papéis e Permissões

| Operação | Admin | Operator | Maintenance |
|----------|-------|----------|-------------|
| Criar sensor | ✅ | ❌ | ✅ |
| Listar sensores | ✅ | ✅ | ✅ |
| Atualizar sensor | ✅ | ❌ | ✅ |
| Deletar sensor | ✅ | ❌ | ❌ |
| Ver estatísticas | ✅ | ✅ | ✅ |
| Operações em lote | ✅ | ❌ | ✅ |

## 📈 Métricas e Monitoramento

### Indicadores Principais

- **Disponibilidade**: Percentual de sensores online
- **Performance**: Latência média de resposta
- **Qualidade**: Taxa de erros de transmissão
- **Manutenção**: Percentual de sensores atualizados
- **Bateria**: Média dos níveis de bateria

### Alertas Automáticos

- Sensor offline por mais de 10 minutos
- Bateria abaixo de 15%
- Calibração vencida há mais de 30 dias
- Taxa de erro acima de 5%
- Sem transmissão por mais de 1 hora

## 🧪 Testes e Validação

### Validações Implementadas

1. **Estrutura**: Campos obrigatórios e tipos
2. **Consistência**: Relacionamentos válidos
3. **Faixa**: Valores dentro dos limites técnicos
4. ** Unicidade**: sensorId único no sistema
5. **Existência**: Tanque associado deve existir

### Cenários de Teste

- ✅ Criação com dados válidos
- ✅ Rejeição de dados inválidos
- ✅ Atualização de configurações
- ✅ Controle de status
- ✅ Operações em lote
- ✅ Filtros de busca
- ✅ Estatísticas e métricas

## 🔄 Próximos Passos

1. **Integração com IoT Gateway** - Conectar com dados em tempo real
2. **Machine Learning** - Detecção automática de anomalias
3. **Predictive Maintenance** - Manutenção preditiva
4. **Edge Computing** - Processamento na borda
5. **Digital Twin** - Gêmeo digital dos sensores

## 📋 Troubleshooting

### Problemas Comuns

1. **Sensor não aparece na lista**
   - Verificar se foi associado a um tanque válido
   - Confirmar que o sensorId é único
   - Verificar permissões do usuário

2. **Dados não atualizam**
   - Verificar conectividade do sensor
   - Confirmar protocolo correto (MQTT/HTTP)
   - Verificar configuração do gateway

3. **Alertas incorretos**
   - Verificar configuração de limites
   - Confirmar calibração atual
   - Verificar dados de referência

### Logs de Debug

```bash
# Habilitar logs detalhados
DEBUG=sensors:* npm run start:dev

# Verificar operações de CRUD
tail -f logs/sensor-operations.log

# Monitorar performance
tail -f logs/sensor-performance.log
```
