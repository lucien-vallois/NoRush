# 🔗 Fase 3: Integração e Testes - Sistema Completo

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 🎯 Objetivos da Fase
- Integrar boias com o gateway LoRaWAN
- Validar fluxo completo de dados
- Executar testes em ambiente controlado
- Otimizar performance do sistema

## 🔧 Atividades Principais

### 1. Conexão Boias-Gateway

#### Configuração LoRaWAN
```python
# Configuração LoRa das Boias
LORAWAN_CONFIG = {
    'frequency': 915000000,  # 915MHz (Brasil)
    'spreading_factor': 7,
    'bandwidth': 125000,
    'coding_rate': 5,
    'sync_word': 0x34,
    'preamble_length': 8
}

# Configuração do Gateway
GATEWAY_CONFIG = {
    'server_address': 'localhost',
    'server_port': 1883,
    'topic_boia_a': 'sensors/boia/oil_level',
    'topic_boia_b': 'sensors/boia/interface_level'
}
```

#### Protocolo de Emparelhamento
1. **Registro das Boias**: Cada boia tem ID único
2. **Configuração de Canais**: Frequências dedicadas por boia
3. **Teste de Comunicação**: Ping-pong inicial
4. **Calibração**: Sincronização de timestamps

#### Segurança LoRaWAN
- **OTAA (Over-the-Air Activation)**: Join automático seguro
- **AES-128 Encryption**: Criptografia end-to-end
- **Frame Counters**: Prevenção de replay attacks

### 2. Validação do Fluxo de Dados

#### Pipeline de Dados Completo
```
Boia → Sensor → MCU → LoRa → Gateway → MQTT → Database → Dashboard
```

#### Estrutura de Dados Padronizada
```txt
Uplink de telemetria (fPort 1) - 12 bytes, big-endian:

Offset  Campo           Tam  Tipo   Range / Unidade
------  --------------  ---  -----  -------------------------
  0     device_id        2   u16    0..65535
  2     seq              1   u8     contador de uplink
  3     flags            1   bits   b0 calib_valid  b1 alerta
                                    b2 bateria_baixa  b3 interface_ok
  4     position_mm      2   u16    0..5000
  6     temp_ddegc       2   i16    -100..600 (0,1 °C)
  8     battery_pct      1   u8     0..100
  9     rssi_enc         1   u8     0 = desconhecido; 1..129 = rssi_dbm + 129
 10     confidence       1   u8     0..100
 11     crc8             1   u8     CRC-8/ATM, poly 0x07, init 0x00
------  --------------  ---  -----  -------------------------
TOTAL                    12 bytes
```

> **Nota de engenharia (v1.3)**: a estrutura JSON anterior (~300 bytes) não
> cabe no LoRaWAN (19 bytes de aplicação em DR0). A telemetria é binária;
> dados de menor frequência vão em uplinks dedicados:
> - **fPort 1** — telemetria (frame acima), 1 leitura/min
> - **fPort 2** — identificação do dispositivo (fw version, modelo, calibração
>   resumida), a cada 24h ou sob demanda
>
> Spec completa: [`firmware/docs/payload.md`](../../firmware/docs/payload.md).

#### Validação de Integridade
- **Checksum**: CRC-8 (poly 0x07) nos 11 primeiros bytes do frame — o LoRaWAN
  já aplica CRC-16 na PHY, então o CRC-8 de aplicação cobre apenas erro de
  codificação/decodificação. (v1.2 propunha CRC-16, redundante com a PHY.)
- **Sequence Numbers**: Detecção de pacotes perdidos
- **Heartbeat**: Verificação de conectividade

### 3. Testes em Ambiente Controlado

#### Setup do Ambiente de Teste
- **Tanque de teste**: 2m x 1m x 1m (vidro acrílico)
- **Bombas peristálticas**: Controle preciso de níveis
- **Sistema de calibração**: Réguas de precisão
- **Câmara climatizada**: Controle de temperatura

#### Cenários de Teste

##### Teste 1: Funcionamento Básico
- **Objetivo**: Validar medição básica
- **Procedimento**:
  1. Preencher tanque com óleo até 50cm
  2. Verificar posicionamento das boias
  3. Monitorar leituras por 1 hora
- **Critérios**: Precisão ±2mm, estabilidade <1mm/min

##### Teste 2: Variação de Níveis
- **Objetivo**: Testar resposta a mudanças
- **Procedimento**:
  1. Variação gradual: +10cm/h por 4 horas
  2. Variação rápida: +20cm em 5 minutos
  3. Ciclos diários simulados
- **Critérios**: Seguimento preciso, sem lags >5s

##### Teste 3: Condições Adversas
- **Objetivo**: Robustez em condições extremas
- **Procedimento**:
  1. Temperatura: 0°C a 60°C
  2. Vibração: até 10Hz, 5mm amplitude
  3. Campos magnéticos: até 1000 Gauss
- **Critérios**: Funcionamento contínuo, precisão mantida

##### Teste 4: Cenário de Falha
- **Objetivo**: Validação de redundância
- **Procedimento**:
  1. Simular falha de comunicação LoRa
  2. Testar bateria crítica
  3. Interrupção de energia no gateway
- **Critérios**: Recuperação automática <30s, dados preservados

### 4. Otimização de Performance

#### Análise de Performance
```python
# Monitor de performance
class PerformanceMonitor:
    def __init__(self):
        self.metrics = {
            'packet_loss': [],
            'latency': [],
            'power_consumption': [],
            'memory_usage': []
        }

    def analyze_performance(self):
        # Análise estatística
        packet_loss_rate = sum(self.metrics['packet_loss']) / len(self.metrics['packet_loss'])
        avg_latency = statistics.mean(self.metrics['latency'])

        return {
            'packet_loss_rate': packet_loss_rate,
            'avg_latency': avg_latency,
            'reliability_score': 1 - packet_loss_rate
        }
```

#### Otimizações Implementadas
- **Duty Cycle LoRa**: Otimização para economia de energia
- **Batch Processing**: Agrupamento de dados no gateway
- **Compression**: Algoritmos de compressão para dados
- **Caching**: Cache local para reduzir latência

## 📊 Métricas de Sucesso

### KPIs Principais
- ✅ **Precisão**: ±1cm em condições normais
- ✅ **Confiabilidade**: >99% uptime do sistema
- ✅ **Latência**: <2s para dados críticos
- ✅ **Consumo**: <100mW médio por boia
- ✅ **Cobertura LoRa**: >500m em campo aberto

### Critérios de Aceitação
- [ ] Todos os testes funcionais passaram
- [ ] Performance atende especificações
- [ ] Sistema tolerante a falhas
- [ ] Documentação de testes completa

### Deliverables da Fase
1. **Sistema integrado** funcional
2. **Relatório completo de testes**
3. **Métricas de performance** validadas
4. **Procedimentos de manutenção**
5. **Plano de rollback** para produção

## 🛠️ Ferramentas de Teste

### Hardware de Teste
- Osciloscópio digital
- Analisador de espectro LoRa
- Multímetro de precisão
- Câmara climatizada
- Shaker para vibração

### Software de Teste
- **Wireshark**: Análise de pacotes LoRa
- **MQTT.fx**: Teste de conectividade MQTT
- **InfluxDB CLI**: Validação de dados
- **Grafana**: Monitoramento em tempo real

## ⏱️ Cronograma Estimado
- **Semana 1-2**: Integração e configuração
- **Semana 3**: Testes básicos e funcionais
- **Semana 4**: Testes de stress e performance
- **Semana 5**: Otimização e validação final

## 🚨 Riscos e Mitigações
- **Risco**: Interferência electromagnética industrial
  - **Mitigação**: Blindagem e testes em ambiente real

- **Risco**: Perda de calibração ao longo do tempo
  - **Mitigação**: Sistema de recalibração automática

- **Risco**: Sobrecarga do gateway com múltiplas boias
  - **Mitigação**: Otimização de processamento e load balancing

---

*Versão: 1.0 | Data: Janeiro 2024*
