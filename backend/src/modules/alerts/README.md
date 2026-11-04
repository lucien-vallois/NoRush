# Alerts Module

## 🚨 Visão Geral

O módulo de alertas gerencia todo o sistema de detecção, notificação e acompanhamento de incidentes no sistema Flowback IoT. Fornece detecção automática de anomalias, notificações multi-canal e ferramentas de gestão de incidentes.

## 🏗️ Componentes

### 1. AlertsService
- **CRUD completo**: Criar, ler, atualizar e gerenciar alertas
- **Reconhecimento**: Sistema de reconhecimento e resolução
- **Operações em lote**: Processamento massivo de alertas
- **Filtros avançados**: Busca e organização por múltiplos critérios
- **Estatísticas**: Métricas detalhadas de performance

### 2. AlertProcessorService
- **Detecção automática**: Regras configuráveis para detecção de anomalias
- **Cooldown inteligente**: Evita spam de notificações
- **Verificações periódicas**: Monitoramento contínuo de sensores
- **Regras configuráveis**: Sistema flexível de regras de alerta

### 3. NotificationService
- **Multi-canal**: Email, SMS, Push, Slack
- **Regras de notificação**: Baseadas na severidade
- **Lotes inteligentes**: Agrupamento de notificações
- **Templates customizáveis**: Mensagens adaptadas por canal

### 4. AlertsController
- **REST API**: Endpoints completos para todas as operações
- **Documentação**: Swagger/OpenAPI automática
- **Autorização**: Controle de acesso baseado em papéis

## 🚨 Tipos de Alertas

### Alertas Automáticos
- **HIGH_LEVEL**: Nível acima do limite máximo
- **LOW_LEVEL**: Nível abaixo do limite mínimo
- **OVERFLOW_RISK**: Risco crítico de transbordo
- **SENSOR_OFFLINE**: Sensor sem comunicação
- **BATTERY_LOW**: Bateria abaixo de 20%
- **SENSOR_ERROR**: Erro no sensor
- **MAINTENANCE_DUE**: Manutenção vencida
- **CALIBRATION_DUE**: Calibração vencida

### Severidades
- **CRITICAL**: Requer ação imediata
- **HIGH**: Atenção urgente necessária
- **MEDIUM**: Atenção necessária
- **LOW**: Informação para conhecimento

## 🔧 Endpoints da API

### CRUD Básico

```http
POST   /alerts                    # Criar alerta
GET    /alerts                    # Listar alertas (com filtros)
GET    /alerts/:id                # Obter alerta por ID
```

### Estados dos Alertas

```http
POST   /alerts/:id/acknowledge    # Reconhecer alerta
POST   /alerts/:id/resolve        # Resolver alerta
```

### Operações em Lote

```http
POST   /alerts/bulk/acknowledge   # Reconhecer múltiplos
POST   /alerts/bulk/resolve       # Resolver múltiplos
```

### Consultas Específicas

```http
GET    /alerts/dashboard          # Dashboard geral
GET    /alerts/active             # Alertas ativos
GET    /alerts/critical           # Alertas críticos
GET    /alerts/unacknowledged     # Não reconhecidos
GET    /alerts/requiring-action   # Precisam ação
GET    /alerts/tank/:tankId       # Por tanque
GET    /alerts/type/:type         # Por tipo
GET    /alerts/severity/:severity # Por severidade
GET    /alerts/status/:status     # Por status
```

### Processamento

```http
GET    /alerts/processor/stats    # Stats do processador
POST   /alerts/processor/check-offline    # Verificar offline
POST   /alerts/processor/check-battery    # Verificar bateria
POST   /alerts/processor/check-maintenance # Verificar manutenção
POST   /alerts/processor/check-errors     # Verificar erros
```

### Notificações

```http
GET    /alerts/notifications/status       # Status dos canais
POST   /alerts/notifications/test/:channel # Testar canal
```

## 🎯 Filtros de Busca

### Parâmetros Disponíveis

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `type` | enum | Tipo do alerta |
| `severity` | enum | Severidade |
| `status` | enum | Status (ACTIVE, ACKNOWLEDGED, RESOLVED) |
| `tankId` | UUID | ID do tanque |
| `sensorId` | UUID | ID do sensor |
| `startDate` | Date | Data inicial |
| `endDate` | Date | Data final |
| `search` | string | Busca por título/mensagem |
| `unacknowledgedOnly` | boolean | Apenas não reconhecidos |
| `criticalOnly` | boolean | Apenas críticos |
| `limit` | number | Limite de resultados |
| `page` | number | Página |
| `sortBy` | string | Ordenação |
| `sortOrder` | string | Direção |

### Exemplos de Uso

```bash
# Alertas críticos ativos
GET /alerts?severity=CRITICAL&status=ACTIVE

# Alertas de um tanque na última semana
GET /alerts?tankId=550e8400-e29b-41d4-a716-446655440000&startDate=2024-01-08T00:00:00Z

# Busca por palavra-chave
GET /alerts?search=overflow&limit=20

# Alertas não reconhecidos ordenados por severidade
GET /alerts?unacknowledgedOnly=true&sortBy=severity&sortOrder=DESC
```

## 📊 Dashboard e Estatísticas

### Visão Geral

```json
{
  "overview": {
    "total": 245,
    "active": 12,
    "acknowledged": 45,
    "resolved": 188,
    "critical": 3
  },
  "distribution": {
    "byType": {
      "HIGH_LEVEL": 89,
      "SENSOR_OFFLINE": 67,
      "BATTERY_LOW": 34,
      "MAINTENANCE_DUE": 23,
      "OVERFLOW_RISK": 12,
      "SENSOR_ERROR": 20
    },
    "bySeverity": {
      "CRITICAL": 15,
      "HIGH": 45,
      "MEDIUM": 98,
      "LOW": 87
    }
  },
  "performance": {
    "avgResolutionTimeHours": 4.2,
    "resolutionRate": 76.7
  }
}
```

### Estatísticas do Processador

```json
{
  "activeRules": 8,
  "cooldownEntries": 45,
  "rulesByType": {
    "HIGH_LEVEL": 2,
    "LOW_LEVEL": 2,
    "OVERFLOW_RISK": 1,
    "SENSOR_OFFLINE": 1,
    "BATTERY_LOW": 1,
    "SENSOR_ERROR": 1
  }
}
```

## 🔧 Sistema de Regras

### Regras de Detecção

```typescript
interface AlertRule {
  type: AlertType;
  severity: AlertSeverity;
  condition: (tank, sensor, reading) => boolean;
  cooldown: number; // minutos
}
```

### Regras Padrão

```typescript
const alertRules = [
  {
    type: 'HIGH_LEVEL',
    severity: 'MEDIUM',
    condition: (tank, sensor, reading) =>
      reading && tank.maxLevelThreshold &&
      reading.level >= tank.maxLevelThreshold,
    cooldown: 30,
  },
  {
    type: 'OVERFLOW_RISK',
    severity: 'CRITICAL',
    condition: (tank, sensor, reading) =>
      reading && tank.overflowThreshold &&
      reading.level >= tank.overflowThreshold,
    cooldown: 15,
  },
  // ... mais regras
];
```

### Cooldown Inteligente

- **CRITICAL**: 15 minutos entre alertas
- **HIGH**: 30 minutos entre alertas
- **MEDIUM**: 60 minutos entre alertas
- **LOW**: 120 minutos entre alertas

## 📱 Sistema de Notificações

### Canais Disponíveis

| Canal | Configuração | Severidade |
|-------|-------------|------------|
| Email | EMAIL_ENABLED | Todas |
| SMS | SMS_ENABLED | CRITICAL, HIGH |
| Push | PUSH_ENABLED | CRITICAL, HIGH |
| Slack | SLACK_ENABLED | Todas |

### Regras de Notificação

```typescript
const notificationRules = [
  {
    severity: 'CRITICAL',
    channels: ['email', 'sms', 'push'],
    immediate: true,
  },
  {
    severity: 'HIGH',
    channels: ['email', 'push'],
    immediate: true,
  },
  {
    severity: 'MEDIUM',
    channels: ['email'],
    immediate: false,
  },
];
```

### Templates de Mensagem

#### Email HTML
```html
<div style="background-color: #dc3545; color: white; padding: 20px;">
  <h1>🚨 ALERTA CRÍTICO</h1>
  <p>Risco de Transbordo Detectado</p>
</div>
<div style="padding: 20px;">
  <p>O nível do tanque atingiu 4.8m, próximo ao limite de transbordo.</p>
  <a href="/alerts/123">Ver Detalhes</a>
</div>
```

#### SMS
```
CRÍTICO: Risco de Transbordo - Tanque A atingiu 4.8m
```

## 🔄 Workflow de Alertas

### 1. Detecção
- Sensor envia leitura
- Regras são verificadas
- Alerta é criado automaticamente

### 2. Notificação
- Usuários são identificados por papel
- Notificações são enviadas pelos canais apropriados
- Templates são aplicados por canal

### 3. Reconhecimento
- Usuário reconhece o alerta
- Status muda para ACKNOWLEDGED
- Timestamp de reconhecimento é registrado

### 4. Resolução
- Usuário resolve o alerta
- Status muda para RESOLVED
- Notas de resolução são registradas
- Tempo de resolução é calculado

### 5. Acompanhamento
- Métricas são atualizadas
- Relatórios são gerados
- Padrões são identificados

## 📈 Performance e Escalabilidade

### Otimizações Implementadas

1. **Índices de Banco**
```sql
CREATE INDEX idx_alerts_tank_status ON alerts(tankId, status);
CREATE INDEX idx_alerts_created_at ON alerts(createdAt);
CREATE INDEX idx_alerts_severity_status ON alerts(severity, status);
```

2. **Cache de Cooldown**
- Mapa em memória para controle de cooldown
- Limpeza automática de entradas antigas
- Evita spam de notificações

3. **Processamento Assíncrono**
- Verificações periódicas em background
- Notificações enviadas em paralelo
- Operações em lote otimizadas

## 🔐 Controle de Acesso

### Papéis e Permissões

| Operação | Admin | Operator | Maintenance |
|----------|-------|----------|-------------|
| Criar alerta | ✅ | ❌ | ✅ |
| Reconhecer alerta | ✅ | ✅ | ✅ |
| Resolver alerta | ✅ | ✅ | ✅ |
| Operações em lote | ✅ | ✅ | ✅ |
| Ver estatísticas | ✅ | ✅ | ✅ |
| Configurar regras | ✅ | ❌ | ❌ |

## 🧪 Testes e Validação

### Cenários de Teste

- ✅ Criação de alertas automáticos
- ✅ Detecção baseada em regras
- ✅ Notificações por múltiplos canais
- ✅ Reconhecimento e resolução
- ✅ Operações em lote
- ✅ Filtros e paginação
- ✅ Cooldown de notificações

### Testes de Canais

```bash
# Testar email
POST /alerts/notifications/test/email

# Testar SMS
POST /alerts/notifications/test/sms

# Testar push
POST /alerts/notifications/test/push
```

## 📋 Troubleshooting

### Problemas Comuns

1. **Alertas não são criados**
   - Verificar se as regras estão ativas
   - Confirmar se o sensor está associado ao tanque
   - Verificar limites configurados no tanque

2. **Notificações não chegam**
   - Verificar configuração dos canais
   - Confirmar credenciais de email/SMS
   - Verificar firewall e conectividade

3. **Cooldown não funciona**
   - Verificar configuração de tempo
   - Confirmar se o mapa de cooldown está sendo limpo
   - Verificar chaves de identificação únicas

### Logs de Debug

```bash
# Habilitar logs detalhados
DEBUG=alerts:* npm run start:dev

# Verificar processamento
tail -f logs/alert-processor.log

# Monitorar notificações
tail -f logs/alert-notifications.log
```

## 🔄 Próximos Passos

1. **Machine Learning** - Detecção de anomalias com ML
2. **Predictive Alerts** - Alertas preditivos
3. **Integration APIs** - Integração com sistemas externos
4. **Advanced Rules** - Regras complexas com condições múltiplas
5. **Alert Templates** - Sistema de templates customizáveis

## 📊 Casos de Uso

### 1. Monitoramento em Tempo Real
```typescript
// Alertas críticos em tempo real
const criticalAlerts = await getCriticalAlerts();
// Notificar equipe de resposta imediata
```

### 2. Relatórios de Incidentes
```typescript
// Análise de incidentes do mês
const filters = {
  startDate: '2024-01-01T00:00:00Z',
  endDate: '2024-01-31T23:59:59Z',
  severity: 'HIGH'
};
const incidents = await findAll(filters);
```

### 3. Dashboard Operacional
```typescript
// Status atual do sistema
const dashboard = await getDashboard();
// Mostrar alertas ativos, taxa de resolução, etc.
```

### 4. Manutenção Preventiva
```typescript
// Identificar padrões de falha
const errorAlerts = await getAlertsByType('SENSOR_ERROR');
// Análise de tendências para manutenção
```
