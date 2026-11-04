# 🔌 Fase 2: Desenvolvimento do Gateway - Roteador Privado

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 🎯 Objetivos da Fase
- Configurar hardware do Raspberry Pi como gateway
- Implementar software embarcado (MQTT, banco de dados)
- Estabelecer comunicação LoRaWAN confiável
- Desenvolver dashboard local básico

## 🔧 Atividades Principais

### 1. Configuração do Hardware do Raspberry Pi

#### Setup Básico do Sistema
```bash
# Instalação do Raspberry Pi OS
- Versão: Raspberry Pi OS Lite (64-bit)
- Configuração headless (sem monitor)
- SSH habilitado por padrão
- Wi-Fi/Ethernet configurado
```

#### Componentes de Hardware Necessários
- **Raspberry Pi 4 Model B** (4GB RAM recomendado)
- **Fonte 12V DC** com conversor buck para 5V
- **Concentrador LoRaWAN** (SX1302/SX1303, 8 canais simultâneos)
- **Antena LoRa** (915MHz no Brasil — ver ANATEL, faixa 915-928 MHz)

> **Correção v1.3**: a versão 1.0 indicava "módulo SX1276/RFM95" como o
> rádio do gateway. O SX1276 é um transceptor de **nó** (1 canal); um gateway
> precisa de um **concentrador** multicâncal (SX1302/SX1303), que é o que
> está especificado em `docs/componentes/gateway-roteador-privado.md`.
- **Case IP65** para proteção ambiental
- **Bateria backup** (12V 7Ah) + controlador de carga

#### Configuração de Rede
- **Wi-Fi AP Mode**: Para acesso local dos operadores
- **Ethernet**: Para conexão com sistemas existentes
- **LoRaWAN Gateway**: Para receber dados das boias

### 2. Implementação do Software Embarcado

#### Instalação e Configuração do MQTT Broker
```bash
# Instalar Mosquitto
sudo apt update
sudo apt install mosquitto mosquitto-clients

# Configurar autenticação
sudo mosquitto_passwd -c /etc/mosquitto/passwd iot_user
sudo nano /etc/mosquitto/mosquitto.conf
```

#### Configuração do Banco de Dados
```bash
# Opção 1: InfluxDB (recomendado para séries temporais)
sudo apt install influxdb
sudo systemctl enable influxdb
sudo systemctl start influxdb

# Opção 2: SQLite (mais simples)
sudo apt install sqlite3
```

#### Setup do LoRaWAN Gateway
```python
# Exemplo de configuração LoRa (Python)
import time
from SX127x.LoRa import *

class LoRaGateway(LoRa):
    def __init__(self, verbose=False):
        super(LoRaGateway, self).__init__(verbose)
        self.set_mode(MODE.SLEEP)
        self.set_freq(915.0)  # Ajustar conforme região

    def on_rx_done(self):
        payload = self.read_payload(nocheck=True)
        # Processar dados da boia
        self.process_boia_data(payload)
```

### 3. Desenvolvimento do Dashboard Local

#### Instalação do Grafana
```bash
# Instalar Grafana
sudo apt install grafana
sudo systemctl enable grafana-server
sudo systemctl start grafana-server

# Configurar datasource InfluxDB
# Acessar http://localhost:3000
# Adicionar datasource InfluxDB
```

#### Interface Web Básica (Node-RED)
```bash
# Instalar Node-RED
sudo npm install -g node-red
sudo npm install -g pm2
pm2 start node-red
pm2 save
pm2 startup
```

#### Funcionalidades do Dashboard
- **Visualização em tempo real** dos níveis das boias
- **Gráficos históricos** (últimas 24h/7d/30d)
- **Alertas configuráveis** (níveis críticos)
- **Status do sistema** (bateria, conectividade)
- **Export de dados** (CSV/PDF)

### 4. Sistema de Alertas Offline

#### Configuração de Alertas
```python
# Exemplo de sistema de alertas
class AlertSystem:
    def __init__(self):
        self.thresholds = {
            'nivel_critico_alto': 4.8,  # metros
            'nivel_critico_baixo': 0.2,  # metros
            'bateria_critica': 15,      # porcentagem
        }

    def check_alerts(self, data):
        alerts = []

        if data['nivel'] > self.thresholds['nivel_critico_alto']:
            alerts.append('NIVEL ALTO CRÍTICO')
        elif data['nivel'] < self.thresholds['nivel_critico_baixo']:
            alerts.append('NIVEL BAIXO CRÍTICO')

        if data['bateria'] < self.thresholds['bateria_critica']:
            alerts.append('BATERIA CRÍTICA')

        return alerts
```

#### Tipos de Notificação
- **Visual**: LED RGB + display LCD
- **Sonoro**: Buzzer com padrões distintos
- **SMS**: Via modem GSM (offline)
- **Log**: Arquivo de eventos local

## 📊 Métricas de Sucesso

### Critérios de Aceitação
- ✅ Gateway recebe >98% dos pacotes LoRa
- ✅ Latência MQTT <100ms local
- ✅ Dashboard carrega em <3s
- ✅ Alertas disparam em <5s
- ✅ Uptime do sistema >99.5%

### Deliverables da Fase
1. **Hardware configurado** e testado
2. **Software embarcado** funcional
3. **Dashboard local** operacional
4. **Sistema de alertas** implementado
5. **Documentação técnica** completa

## 🛠️ Dependências e Bibliotecas

### Python Libraries
```txt
paho-mqtt==1.6.1
influxdb-client==1.36.1
RPi.GPIO==0.7.1
spidev==3.6
```

### System Services
- Mosquitto MQTT Broker
- InfluxDB Time Series Database
- Grafana Dashboard
- Node-RED Flow Editor

## ⏱️ Cronograma Estimado
- **Semana 1**: Setup hardware e sistema base
- **Semana 2**: Configuração MQTT e banco de dados
- **Semana 3**: Desenvolvimento LoRaWAN gateway
- **Semana 4**: Dashboard e sistema de alertas
- **Semana 5**: Testes integrados e otimização

## 🚨 Riscos e Mitigações
- **Risco**: Interferência LoRa em ambiente industrial
  - **Mitigação**: Testes de cobertura e ajuste de frequência

- **Risco**: Sobrecarga do Raspberry Pi
  - **Mitigação**: Otimização de código e monitoramento de recursos

- **Risco**: Perda de dados por falta de energia
  - **Mitigação**: UPS e estratégia de persistência

---

*Versão: 1.0 | Data: Janeiro 2024*
