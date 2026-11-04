# 📌 Plano de Projeto – Boias Inteligentes e Roteadores Privados

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](plano-d-desenvolvimento.md).

## 1. Boias Inteligentes (Sensores de Nível)

Este projeto requer o desenvolvimento de duas boias distintas com características específicas para medição precisa de níveis em tanques industriais:

### Boia A (Óleo)
- **Função**: Mede o nível superior do óleo
- **Características**: Deve flutuar na superfície do óleo

### Boia B (Interface Água-Óleo)
- **Função**: Mede a transição entre as camadas de água e óleo
- **Características**: Deve afundar no óleo e flutuar na água

## 🔹 Estrutura Mecânica

### Material da Boia
- **Primário**: Polietileno de alta densidade (HDPE)
  - Leve e anticorrosivo
- **Alternativo**: Aço inoxidável 316L
  - Maior resistência em ambientes agressivos

### Formato
- Cilíndrico ou esférico
- Lastro interno para estabilidade

### Fixação
- Tubo-guia (PVC/INOX) dentro do tanque
- Evita deslocamento lateral da boia

## 🔹 Diferenciação Água vs Óleo

### Boia Óleo (Nível Superior)
- **Densidade**: < 850 kg/m³
- **Comportamento**: Flutua sobre o óleo
- **Material**: Espuma de poliuretano revestida com HDPE

### Boia Água (Interface Óleo/Água)
- **Densidade**: 950–990 kg/m³
- **Comportamento**: Afunda no óleo, flutua na água
- **Material**: Polipropileno maciço calibrado

## 🔹 Sensores Embarcados

### Opções de Sensoriamento
1. **GPS RTK (GNSS de alta precisão)**
   - Mede altitude da boia
   - Requer sinal externo

2. **Ultrassom/Radar miniaturizado**
   - Mede distância até o fundo
   - Montado na própria boia

3. **Encoder magnético com cabo guiado**
   - Fio liga a boia ao roteador
   - Mede posição diretamente

4. **Encodador magnetostrutivo linear** ⭐ *Recomendado (v1.3)*
   - Barra de onda com flutuador magnético
   - ±1mm em 5m, interface digital SSI/RS485
   - Substitui a opção 5, descartada por limitação de resolução

5. ~~**RFID + Régua magnética**~~ ❌ *Descartado (v1.3)*
   - Leitura por tags entrega ~1cm de resolução
   - Para ±1mm em 5m seriam ~5000 tags — inviável
   - Ver nota em `docs/componentes/boia-a-oleo.md`

## 🔹 Eletrônica da Boia

### Microcontrolador (MCU)
- **Adotado (v1.3)**: STM32L432KC (Boia A) e STM32L072KB (Boia B)
  - Ambos ARM Cortex-M, suportados por GNAT/Ada e SPARK
- **Descartado**: ESP32 (arquitetura Xtensa, sem suporte a Ada/GNAT)
- **Justificativa**: o firmware é desenvolvido em Ada/SPARK para permitir
  verificação formal exigida pela certificação ATEX/IECEx

### Energia
- Bateria de lítio 3.6V
- Painel solar pequeno para recarga

### Comunicação
- **LoRaWAN**: Para gateway privado
- **NB-IoT**: Para cobertura celular

### Certificações
- **ATEX/IECEx**: Essencial para áreas classificadas (explosivas)

---

## 2. Roteador Privado (Gateway Edge)

O roteador privado funciona como o cérebro local do sistema, recebendo dados das boias e disponibilizando-os para operadores sem necessidade de conexão com a internet.

## 🔹 Hardware

### Plataforma
- **Primária**: Raspberry Pi 4 industrializado
  - Case IP65
  - Alimentação redundante
- **Alternativa**: Gateway LoRaWAN industrial
  - Exemplos: Multitech, Kerlink

### Energia
- 12/24V DC do campo
- Bateria backup
- Painel solar opcional

### Conectividade
- LoRa concentrador (para boias LoRa)
- Ethernet + Wi-Fi interno
- 4G/Sat opcional para sincronização futura

## 🔹 Software

### Componentes Principais
- **Broker MQTT local** (Mosquitto)
  - Recebe dados das boias
- **Banco de dados local** (InfluxDB/SQLite)
  - Armazena histórico de dados
- **Dashboard local** (Grafana/Node-RED)
  - Acesso via navegador (sem internet)
- **Sistema de alertas offline**
  - Buzzer
  - SMS local via GSM
  - Alerta visual (torre de sinal)

### APIs
- REST/WebSocket local
- Preparado para integrações futuras

---

## 3. Fluxo de Dados

### Estrutura de Comunicação

```
Boia → Pacote de dados → Roteador → Processamento → Armazenamento → Dashboard
```

### Exemplo de Pacote de Dados
```txt
Frame binário LoRaWAN (fPort 1) - 12 bytes:

  device_id(2) | seq(1) | flags(1) | position_mm(2)
  temp_ddegc(2) | battery_pct(1) | rssi_dbm(1)
  confidence(1) | crc8(1)

Especificação completa: firmware/docs/payload.md
```

> **Correção v1.3**: o exemplo JSON anterior não cabe no LoRaWAN (19 bytes de
> aplicação em DR0). A telemetria é binária.

### Processo de Dados
1. **Recepção**: Roteador recebe via LoRaWAN/NB-IoT
2. **Armazenamento**: Dados armazenados no MQTT broker
3. **Processamento**: Conversão nível → volume usando tabela de arqueação
4. **Disponibilização**: Acesso via dashboards locais
5. **Alertas**: Notificações em tempo real baseadas em thresholds

---

## 📋 Próximos Passos

### Fase 1: Prototipagem
- Desenvolvimento de protótipo das boias
- Testes de densidade e estabilidade
- Validação de sensores

### Fase 2: Desenvolvimento do Gateway
- Configuração do Raspberry Pi
- Implementação do software embarcado
- Testes de comunicação LoRaWAN

### Fase 3: Integração e Testes
- Conexão boias-gateway
- Validação do fluxo de dados
- Testes em ambiente controlado

### Fase 4: Certificações e Produção
- Certificações ATEX/IECEx
- Otimização para produção
- Documentação técnica completa

---

## 🎯 Benefícios Esperados

- **Monitoramento Contínuo**: Níveis em tempo real sem intervenção manual
- **Operação Offline**: Funciona sem internet em áreas remotas
- **Manutenção Preditiva**: Alertas automáticos para condições anômalas
- **Custos Reduzidos**: Eliminação de medições manuais e visitas desnecessárias
- **Segurança**: Monitoramento remoto de tanques em áreas perigosas

---

*Documento criado em janeiro de 2024*  
*Versão: 1.0*
