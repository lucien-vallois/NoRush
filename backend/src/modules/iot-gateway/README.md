# IoT Gateway Module

## 📡 Visão Geral

O módulo IoT Gateway é responsável pela ingestão e processamento de dados dos sensores em tempo real. Suporta múltiplos protocolos de comunicação (MQTT e HTTP) e garante processamento confiável dos dados com validação e tratamento de erros.

## 🏗️ Arquitetura

```
Sensores → MQTT/HTTP → Gateway → Validação → Processamento → RabbitMQ → Banco
                                              ↓
                                        Alertas em Tempo Real
```

## 🔧 Componentes

### 1. MQTT Service
- **Protocolo**: MQTT 5.0
- **Tópicos**:
  - `sensors/data` - Dados dos sensores
  - `sensors/+/status` - Status dos sensores
  - `sensors/+/commands` - Comandos para sensores
- **QoS**: 1 (pelo menos uma entrega)
- **Retain**: Configurável por tópico

### 2. HTTP Service
- **Protocolo**: REST API
- **Autenticação**: Token opcional
- **Limites**: 100 mensagens por lote
- **Timeout**: 30 segundos por requisição

### 3. Message Processor
- **Validação**: Estrutura e consistência dos dados
- **Processamento**: Conversão nível-volume
- **Persistência**: Armazenamento no PostgreSQL
- **Queue**: Publicação no RabbitMQ

## 📡 Endpoints HTTP

### Envio de Dados do Sensor

```http
POST /iot/sensors/data
Content-Type: application/json

{
  "sensorId": "SENSOR-001",
  "level": 3.45,
  "batteryLevel": 85.5,
  "timestamp": "2024-01-15T10:30:00Z",
  "oilWaterInterface": {
    "oilLevel": 2.5,
    "waterLevel": 1.2,
    "interfaceLevel": 2.1
  },
  "metadata": {
    "signalStrength": -45,
    "temperature": 25.5
  }
}
```

**Resposta:**
```json
{
  "sensorId": "SENSOR-001",
  "received": true,
  "processed": true,
  "timestamp": "2024-01-15T10:30:05Z",
  "requestId": "req_1705312205000_abc123"
}
```

### Envio em Lote

```http
POST /iot/sensors/batch
Content-Type: application/json

[
  {
    "sensorId": "SENSOR-001",
    "level": 3.45,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  {
    "sensorId": "SENSOR-002",
    "level": 2.89,
    "timestamp": "2024-01-15T10:30:05Z"
  }
]
```

### Envio de Comandos

```http
POST /iot/sensors/commands
Content-Type: application/json

{
  "sensorId": "SENSOR-001",
  "command": "CALIBRATE",
  "parameters": {
    "offset": 0.05
  },
  "requestId": "req_123456"
}
```

**Comandos Disponíveis:**
- `CALIBRATE` - Calibrar sensor
- `RESET` - Reinicializar sensor
- `UPDATE_CONFIG` - Atualizar configuração
- `DIAGNOSTIC` - Executar diagnóstico
- `SHUTDOWN` - Desligar sensor

### Status do Comando

```http
GET /iot/sensors/commands/req_123456
```

**Resposta:**
```json
{
  "requestId": "req_123456",
  "status": "SUCCESS",
  "timestamp": "2024-01-15T10:31:00Z",
  "result": {
    "command": "CALIBRATE",
    "executedAt": "2024-01-15T10:30:30Z",
    "executionTime": 5000
  }
}
```

### Status do Sensor

```http
GET /iot/sensors/SENSOR-001/status
```

**Resposta:**
```json
{
  "sensorId": "SENSOR-001",
  "connected": true,
  "lastSeen": "2024-01-15T10:30:00Z",
  "batteryLevel": 85,
  "signalStrength": -45,
  "firmwareVersion": "1.2.3"
}
```

## 📊 Monitoramento

### Estatísticas do Gateway

```http
GET /iot/gateway/stats
```

**Resposta:**
```json
{
  "mqtt": {
    "connected": true,
    "reconnectAttempts": 0,
    "messagesReceived": 1250,
    "messagesProcessed": 1245
  },
  "http": {
    "activeRequests": 2,
    "totalRequests": 500,
    "successRate": 98.5
  },
  "processor": {
    "totalProcessed": 1245,
    "successRate": 99.2,
    "averageProcessingTime": 45
  },
  "uptime": 3600,
  "timestamp": "2024-01-15T11:00:00Z"
}
```

### Verificação de Saúde

```http
GET /iot/gateway/health
```

**Resposta:**
```json
{
  "mqtt": true,
  "rabbitmq": true,
  "database": true,
  "timestamp": "2024-01-15T11:00:00Z"
}
```

## 🧪 Testes e Simulação

### Simulação de Dados

```http
POST /test/simulate?sensorId=SENSOR-001&protocol=mqtt&count=5
```

### Echo Test

```http
GET /test/echo?message=Hello%20IoT
```

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_USER=
MQTT_PASS=
MQTT_PROTOCOL=mqtt
MQTT_TOPIC_SENSOR_DATA=sensors/data
MQTT_QOS=1
MQTT_RETAIN=false

# RabbitMQ
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=guest
RABBITMQ_PASS=guest
```

### Configuração do Sensor

Cada sensor deve enviar dados no formato:

```json
{
  "sensorId": "string",        // ID único do sensor
  "level": "number",           // Nível em metros (obrigatório)
  "batteryLevel": "number?",   // Nível de bateria 0-100
  "timestamp": "string?",      // ISO 8601 (opcional, usa atual se não informado)
  "oilWaterInterface": {       // Interface óleo-água (opcional)
    "oilLevel": "number",
    "waterLevel": "number",
    "interfaceLevel": "number"
  },
  "metadata": "object?",       // Dados adicionais do sensor
  "version": "string?",        // Versão do firmware/protocolo
  "authToken": "string?"       // Token de autenticação
}
```

## 🔍 Validação de Dados

### Regras de Validação

1. **Estrutura Básica**: `sensorId` e `level` obrigatórios
2. **Faixa de Valores**: Nível deve ser positivo
3. **Consistência**: Interface óleo-água deve ser consistente
4. **Sensor Existente**: Sensor deve estar cadastrado
5. **Limites do Tanque**: Nível dentro da faixa configurada

### Tratamento de Erros

- **Dados Inválidos**: Log detalhado + resposta de erro
- **Sensor Desconhecido**: Registro em log + rejeição
- **Falha de Conectividade**: Retry automático + alerta
- **Timeout**: Cancelamento graceful + notificação

## 📈 Métricas de Performance

### Indicadores Monitorados

- **Throughput**: Mensagens por segundo
- **Latência**: Tempo de processamento médio
- **Taxa de Sucesso**: Percentual de mensagens processadas
- **Uptime**: Disponibilidade do serviço
- **Erros**: Taxa de erro por tipo

### Alertas Automáticos

- Conectividade MQTT perdida
- Taxa de sucesso abaixo de 95%
- Latência acima de 100ms
- Erros consecutivos em processamento

## 🚀 Próximos Passos

1. **WebSocket Integration** - Notificações em tempo real
2. **Batch Optimization** - Processamento em lote otimizado
3. **Protocol Buffers** - Serialização binária para alta performance
4. **Load Balancing** - Distribuição de carga entre instâncias
5. **Edge Computing** - Processamento na borda da rede

## 📋 Troubleshooting

### Problemas Comuns

1. **MQTT não conecta**
   - Verificar credenciais
   - Verificar firewall/portas
   - Verificar configuração do broker

2. **Dados rejeitados**
   - Verificar formato JSON
   - Verificar campos obrigatórios
   - Verificar cadastro do sensor

3. **Alta latência**
   - Verificar conectividade de rede
   - Verificar carga do sistema
   - Verificar configuração do banco

### Logs de Debug

```bash
# Habilitar logs detalhados
DEBUG=iot-gateway:* npm run start:dev

# Verificar logs do MQTT
tail -f logs/mqtt-gateway.log

# Verificar processamento
tail -f logs/message-processor.log
```
