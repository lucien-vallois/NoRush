# 🔌 Componente: Gateway/Roteador Privado - Especificações Técnicas

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 📋 Visão Geral
O Gateway Roteador Privado é o componente central do sistema, responsável por receber dados das boias via LoRaWAN, processar as informações e disponibilizar dashboards locais para os operadores. Funciona completamente offline, garantindo operação independente em áreas remotas.

## 🔧 Especificações Técnicas

### Hardware Principal

#### Plataforma Computacional
- **Processador**: Raspberry Pi 4 Model B
- **CPU**: Quad-core ARM Cortex-A72 1.5GHz
- **RAM**: 4GB LPDDR4
- **Armazenamento**: 64GB microSD Class 10
- **Conectividade**: Gigabit Ethernet, Wi-Fi 802.11ac, Bluetooth 5.0

#### Case e Proteção Ambiental
- **Material**: ABS com reforço de fibra de vidro
- **Grau de proteção**: IP65 (poeira e água)
- **Resistência**: IK08 (impacto)
- **Ventilação**: Passiva com filtros anti-poeira
- **Dimensões**: 200mm x 150mm x 80mm

#### Alimentação
- **Tensão de entrada**: 12-24V DC
- **Consumo típico**: 15W
- **Bateria backup**: 12V 7Ah (4-6 horas de autonomia)
- **Painel solar**: 20W opcional com controlador MPPT
- **Proteções**: Overvoltage, short-circuit, reverse polarity

### Módulos de Comunicação

#### Módulo LoRa Gateway
- **Chip**: SX1302/SX1303 (Semtech)
- **Frequência**: 915MHz (Brasil)
- **Canais**: 8 canais simultâneos
- **Sensibilidade**: -142dBm
- **Potência TX**: +27dBm
- **Alcance**: Até 10km (linha de vista)

#### Interfaces de Rede
- **Ethernet**: 1x Gigabit para backbone industrial
- **Wi-Fi AP**: 2.4GHz/5GHz para dispositivos móveis
- **USB**: 4x USB 3.0 para periféricos
- **Serial**: 2x UART para equipamentos legados

#### Antenas
- **LoRa**: Antena externa omnidirecional 5dBi
- **Wi-Fi**: Antena interna + externa opcional
- **GPS**: Opcional para timestamp preciso

### Software e Sistema Operacional

#### Sistema Base
- **OS**: Raspberry Pi OS Lite (64-bit)
- **Kernel**: Linux 5.15 LTS
- **Boot**: Systemd com watchdog
- **Atualizações**: OTA (Over-The-Air) seguro

#### Serviços Core
```txt
Principais serviços:
- LoRa Gateway (packet-forwarder)
- MQTT Broker (Mosquitto 2.0)
- Database (InfluxDB 2.x)
- Dashboard (Grafana 9.x)
- Node-RED (flows de processamento)
```

#### Configuração de Rede
```yaml
network:
  interfaces:
    eth0: 192.168.1.100/24 (rede industrial)
    wlan0: 192.168.2.1/24 (AP Wi-Fi)
  dns: 8.8.8.8, 1.1.1.1
  firewall: ufw com regras específicas
```

### Processamento de Dados

#### Pipeline de Dados
```
Boia → LoRa → Gateway → MQTT → Processamento → Database → Dashboard
```

#### Processamento em Tempo Real
```python
class DataProcessor:
    def __init__(self):
        self.mqtt_client = mqtt.Client()
        self.db_client = InfluxDBClient()
        self.alert_engine = AlertEngine()

    def process_boia_data(self, raw):
        # 1. Decodificar frame binário de 12 bytes + validar CRC-8
        #    (spec: firmware/docs/payload.md)
        frame = payload_codec.decode(raw)   # None se CRC/range inválido
        if frame is None:
            return

        # 2. Converter posição (mm) -> nível (m) aplicando calibração
        processed_data = self.convert_units(frame)

        # 3. Aplicar tabela de arqueação (posição -> volume)
        volume_data = self.apply_arqueacao_table(processed_data)

        # 4. Armazenar no database
        self.store_data(volume_data)

        # 5. Verificar alertas
        self.alert_engine.check_thresholds(volume_data)

        # 6. Publicar para dashboards
        self.publish_to_dashboards(volume_data)
```

> **Nota de engenharia (v1.3)**: os frames das boias não são JSON. O payload
> LoRaWAN é binário, com 12 bytes e CRC-8 (limite de aplicação em DR0 = 19
> bytes). A especificação completa está em
> [`firmware/docs/payload.md`](../../firmware/docs/payload.md) e a implementação
> de referência em `firmware/src/app/payload_codec` (Ada/SPARK, com contratos
> que provam ausência de estouro de buffer). A reimplmentação em Python do
> gateway deve ser coberta pelos mesmos casos de teste.

#### Tabela de Arqueação
- **Arquivo**: `arqueacao_tanque.json`
- **Estrutura**: Lookup table posição → volume
- **Precisão**: ±0.5% do volume total
- **Atualização**: Via interface web

### Dashboard e Interface

#### Grafana Dashboards
**Dashboards Disponíveis**:
- **Visão Geral**: Status do sistema e alertas ativos
- **Níveis em Tempo Real**: Gráficos das boias A e B
- **Histórico**: Dados dos últimos 30 dias
- **Alertas**: Log de eventos e notificações
- **Manutenção**: Status dos dispositivos

#### Interface Web Local
- **Framework**: React + Node.js
- **Acesso**: http://gateway.local
- **Autenticação**: Local (usuário/senha)
- **Responsivo**: Compatível com tablets industriais
- **Offline-first**: Funciona sem internet

#### APIs Disponíveis
```txt
Endpoints REST:
- GET /api/status - Status geral do sistema
- GET /api/levels - Níveis atuais
- GET /api/history?period=24h - Dados históricos
- POST /api/alerts - Configuração de alertas
- PUT /api/calibration - Ajustes de calibração
```

### Sistema de Alertas

#### Tipos de Alerta
```txt
Alertas configuráveis:
- Nível crítico alto (>95% capacidade)
- Nível crítico baixo (<5% capacidade)
- Interface anormal (boia B fora da faixa)
- Falha de comunicação (>5min sem dados)
- Bateria baixa (<20%)
- Temperatura extrema (>50°C ou <0°C)
```

#### Mecanismos de Notificação
- **Visual**: LED RGB no painel frontal
- **Sonoro**: Buzzer com padrões distintos
- **SMS**: Via modem GSM opcional
- **Log**: Arquivo local + email (se configurado)
- **Relay**: Contatos secos para sirenes externas

#### Configuração de Alertas
```json
{
  "alerts": {
    "level_high": {
      "enabled": true,
      "threshold": 4.8,
      "hysteresis": 0.1,
      "notification": ["buzzer", "led", "log"],
      "cooldown": 300
    }
  }
}
```

### Segurança e Acesso

#### Controle de Acesso
- **Usuários locais**: Até 5 usuários com perfis diferentes
- **Autenticação**: Senha local (não depende de internet)
- **Logs de acesso**: Registro completo de todas as operações
- **Timeout**: Logout automático após 30min de inatividade

#### Segurança de Dados
- **Encriptação**: AES-256 para dados sensíveis
- **Backup**: Automático para USB externo
- **Integrity**: Checksums para arquivos críticos
- **Firewall**: Regras específicas para cada interface

### Armazenamento e Backup

#### Database Local
- **Sistema**: InfluxDB 2.x
- **Retenção**: 2 anos de dados históricos
- **Compressão**: Ativa para otimizar espaço
- **Backup**: Diário automático

#### Estratégia de Backup
```txt
Backups automáticos:
- Dados operacionais: A cada 6 horas
- Configurações: Diariamente
- Firmware: Antes de atualizações
- Destino: USB externo + cartão SD reserva
```

### Monitoramento e Diagnóstico

#### Health Monitoring
- **CPU/Memória**: Thresholds configuráveis
- **Armazenamento**: Alerta quando >80% usado
- **Temperatura**: Sensor interno do Raspberry Pi
- **Rede**: Monitoramento de conectividade LoRa/Wi-Fi

#### Ferramentas de Diagnóstico
- **Logs centralizados**: Journald + logrotate
- **Status dashboard**: Página dedicada de monitoramento
- **Testes automáticos**: Health checks a cada 5 minutos
- **Remote access**: SSH para manutenção (opcional)

### Performance e Escalabilidade

#### Capacidade do Sistema
- **Boias simultâneas**: Até 50 dispositivos
- **Frequência de dados**: 1 leitura por minuto por boia
- **Latência típica**: <500ms (local)
- **Uptime esperado**: >99.5%

#### Limites e Restrições
- **Armazenamento**: 64GB (expandível via USB)
- **Processamento**: Adequado para até 100 boias
- **Banda LoRa**: 8 canais simultâneos
- **Usuários simultâneos**: Até 10 dashboards ativos

### Instalação e Configuração

#### Pré-requisitos
- **Ambiente**: Temperatura 0-40°C, umidade <80%
- **Espaço**: 30cm de ventilação ao redor
- **Alimentação**: 12-24V DC estável
- **Rede**: Cabo Ethernet para configuração inicial

#### Procedimento de Instalação
1. **Montagem física**: Fixar em painel ou parede
2. **Conexões elétricas**: Alimentação + antena LoRa
3. **Configuração inicial**: Via Ethernet + navegador
4. **Registro de boias**: Adicionar dispositivos via interface
5. **Testes funcionais**: Verificar comunicação completa

### Manutenção e Suporte

#### Manutenção Preventiva
```txt
Tarefas regulares:
- Verificação visual: Mensal
- Limpeza de filtros: Trimestral
- Backup manual: Mensal
- Atualização firmware: Semestral
- Calibração relógio: Anual
```

#### Suporte Técnico
- **Local**: Interface de diagnóstico integrada
- **Remoto**: SSH para equipe de suporte
- **Logs**: Exportação automática para análise
- **Documentação**: Manual técnico completo

### Custos e Viabilidade

#### Custo de Produção Estimado
- **Hardware base**: R$ 650,00 (Raspberry Pi + case)
- **Módulos comunicação**: R$ 280,00 (LoRa + antenas)
- **Bateria backup**: R$ 120,00
- **Licenças software**: R$ 150,00
- **Total**: R$ 1.200,00

#### ROI Esperado
- **Vida útil**: 5-7 anos
- **Manutenção anual**: R$ 80,00
- **Benefícios**: Monitoramento 24/7, redução de visitas
- **Payback**: 6-8 meses

---

## 📞 Suporte e Contato

### Especificações de Garantia
- **Duração**: 36 meses
- **Cobertura**: Defeitos de fabricação
- **Suporte**: 24/7 helpdesk técnico
- **Exclusões**: Danos por descarga elétrica

### Documentação Relacionada
- [Manual de Instalação Gateway](./manual-gateway.md)
- [Configuração Avançada](./config-gateway.md)
- [Troubleshooting Guide](./troubleshoot-gateway.md)

---

*Versão: 1.3 | Data: Janeiro 2024 | Aprovado para Produção*
