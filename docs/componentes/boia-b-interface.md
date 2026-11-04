# 🔵 Componente: Boia B (Interface Água-Óleo) - Especificações Técnicas

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 📋 Visão Geral
A Boia B é especializada em detectar a interface entre camadas de água e óleo em tanques industriais. Utiliza materiais de densidade intermediária para afundar no óleo e flutuar na água, proporcionando medição precisa da transição entre fluidos.

## 🔧 Especificações Técnicas

### Características Físicas
- **Diâmetro**: 120mm
- **Altura**: 150mm
- **Volume externo**: 1,70 dm³ (π · 60mm² · 150mm)
- **Peso total**: 1,55 - 1,75 kg
- **Densidade operacional**: 950-990 kg/m³
- **Temperatura de operação**: -10°C a 60°C

> **Nota de engenharia (v1.3)**: a massa deve fechar com a densidade alvo.
> Em 1,70 dm³, ρ = 950-990 kg/m³ exige **1,62-1,68 kg**. As especificações
> anteriores (180-280g) resultariam em densidade aparente de ~105-165 kg/m³ —
> a boia flutuaria sobre o óleo em vez de afundar até a interface água/óleo.

### Materiais de Construção

#### Estrutura Externa
- **Material principal**: Polipropileno maciço (PP)
- **Espessura**: 3-4mm
- **Tratamento superficial**: Anti-UV e antiestático
- **Certificação**: ATEX Zone 1 compatível

#### Núcleo de Flutuação
- **Material**: Polipropileno com aditivos para densidade controlada
- **Densidade**: 950-990 kg/m³
- **Volume**: 85% do volume interno
- **Homogeneidade**: ±10 kg/m³

#### Lastro de Estabilidade
- **Material**: Liga de zinco encapsulada
- **Peso**: 230-260g (13-15% do peso total de ~1,65 kg)
- **Posicionamento**: Centro de gravidade otimizado
- **Vedação**: Epóxi resistente a água e óleo

### Sistema de Sensoriamento

#### Sensor Principal: Encodador Magnetostrutivo Linear + Condutividade
```txt
Especificações (posição):
- Tipo: Sensor magnetostrutivo de posição linear (float magnético)
- Range: 0-5000 mm
- Resolução: 0,1 mm
- Precisão absoluta: ±1 mm
- Interface digital: RS485 (Modbus RTU) ou SSI
- Proteção: Encapsulamento IP67

Especificações (condutividade — validação de interface):
- Faixa: 0-2000 µS/cm
- Resolução: 1 µS/cm
- Limiar água: >500 µS/cm
- Célula: dois eletrodos inox 316L, compensação de temperatura
```

> **Nota de engenharia (v1.3)**: a especificação anterior ("RFID + régua
> magnética", PN5180) tinha o mesmo problema da Boia A — leitura por tags não
> entrega ±1mm em 5m. Corrigido para encodador magnetostrutivo.

#### Componentes Eletrônicos
- **Front-end do sensor**: condicionamento SSI/RS485 isolado
- **Front-end de condutividade**: oscilador de 4 fios + ADC
- **Microcontrolador**: STM32L072KB (ARM Cortex-M0+, 192KB Flash, 20KB RAM)
- **Módulo LoRa**: SX1262 (915MHz, baixo consumo)
- **Bateria**: LiPo 3.7V 1000mAh (módulo encapsulado)

> **Nota de engenharia (v1.3)**: o STM32L072 tem 20KB de RAM, apertado para a
> stack LoRaWAN. O firmware foi projetado com **alocação estática** (sem heap)
> e runtime Ada `light`, com orçamento de RAM explícito em
> `firmware/docs/energy-budget.md`. Não usar runtime `light-tasking`.

### Sistema de Energia

#### Bateria Principal
- **Tipo**: Lítio-polímero (módulo encapsulado com circuito de proteção)
- **Capacidade**: 1000mAh
- **Tensão**: 3.7V nominal
- **Ciclos de vida**: >600 ciclos completos
- **Proteção**: Overcharge / over-discharge / curto-circuito / PTC

#### Painel Solar (Opcional)
- **Potência**: 0,8W
- **Eficiência**: >16%
- **Dimensões**: 80mm x 50mm
- **Controlador**: carga CC/CV simples

#### Orçamento de Energia (1 leitura/min, SF8BW125)

> Números calculados pelo modelo executável em `firmware/src/app/energy_mgr`
> e fixados por teste em `firmware/tests/test_energy.adb`. Se os parâmetros
> de consumo mudarem, os testes falham e este bloco deve ser atualizado.

```txt
Evento (a cada 60s):
  Acordar + condutividade + posição + proc.  12 mA  por  30 ms
  TX LoRa 12 bytes (SF8, +10dBm)            30 mA  por 160 ms
  Janelas RX1/RX2 (classe A)              5,5 mA  por 430 ms
  Tempo ativo por ciclo                                620 ms
  Energia por ciclo                    8.415.700 uA*ms = 0,0023 mAh

Consumo por modo:
  Sleep profundo (STOP + SX1262 sleep):     15 uA
  Sleep contínuo (24 h):                    0,36 mAh/dia
  Corrente média (1440 ciclos/dia):        140 uA = 3,36 mAh/dia

Autonomia calculada (bateria 1000 mAh):
  SF8  (1-2 km), 80% utilizável:   237 dias  (~7,8 meses)
  SF8  (1-2 km), 100% nominal:     297 dias  (~9,8 meses)
  SF12 (3-4 km), 80% utilizável:    41 dias  (~1,4 meses)
  Com painel 0,8W:                 indefinida em regime nominal
```

> Os consumos anteriores (0,3mA em sleep, 35-50 dias de autonomia) não eram
> consistentes com o duty cycle de 1 leitura/min. Corrigidos conforme
> datasheets do STM32L0 e do SX1262.

### Comunicação

#### Protocolo LoRaWAN
- **Frequência**: 915MHz (Brasil)
- **Spreading Factor**: 8-12 (otimizado para baixo consumo)
- **Bandwidth**: 125kHz
- **Potência TX**: +10dBm (10mW) - reduzido para economia
- **Alcance**: 1-3km (campo aberto)

#### Formato do Payload (Uplink)

> **Nota de engenharia (v1.3)**: o payload JSON anterior (~185 bytes) não cabe
> no LoRaWAN (limite de 19 bytes de aplicação em DR0). A Boia B usa o **mesmo
> frame binário de 12 bytes** da Boia A, ocupando o campo `confidence` (0-100)
> com o score de detecção de interface.

```txt
Offset  Campo           Tam  Tipo    Conteúdo na Boia B
------  --------------  ---  ------  --------------------------
  0     device_id        2   u16     ID lógico da boia
  2     seq              1   u8      contador de uplink (wrap)
  3     flags            1   bitset  b0=calib_valid  b1=alerta
                                     b2=bateria_baixa  b3=interface_ok
  4     position_mm      2   u16     posição da interface (mm)
  6     temp_ddegc       2   i16     temperatura do fluido (0,1 °C)
  8     battery_pct      1   u8      carga estimada (%)
  9     rssi_enc         1   u8      0 = desconhecido; 1..129 = rssi_dbm + 129
 10     confidence       1   u8      score de confiança da interface
 11     crc8             1   u8      CRC-8/ATM, poly 0x07, init 0x00
------  --------------  ---  ------  --------------------------
TOTAL                    12 bytes
```

A especificação completa do frame (byte order, CRC, limites) está em
[`firmware/docs/payload.md`](../../firmware/docs/payload.md). O codificador
fonte de verdade é `firmware/src/app/payload_codec`.

Exemplo de frame (Boia B: device_id=2, seq=23, calib_valid + interface_ok,
interface a 1850 mm, 26,8 °C, bateria 78%, RSSI -82 dBm, confiança 95):
```txt
00 02 17 09 07 3A 01 0C 4E 2F 5F CA
\____/ |  |  \____/ \____/ |  |  |  \-- crc8 = 0xCA
   |   |  |     |      |    |  |  \---- confidence = 95 = 0x5F
   |   |  |     |      |    |  \------- rssi_enc = -82 + 129 = 47 = 0x2F
   |   |  |     |      |    \---------- battery = 78 = 0x4E
   |   |  |     |      \--------------- temp = 268 = 0x010C
   |   |  |     \---------------------- position = 1850 = 0x073A
   |   |  \---------------------------- flags = 0x09 (calib_valid|interface_ok)
   |   \------------------------------- seq = 23 = 0x17
   \----------------------------------- device_id = 2 = 0x0002
```

> Vetor de ouro fixado em `firmware/tests/test_payload.adb`.

### Sistema de Fixação

#### Tubo-Guia Compartilhado
- **Compartilhamento**: mesmo tubo-guia da Boia A
- **Separação**: flutuador magnético independente
- **Diâmetro interno**: 25mm
- **Comprimento**: compatível com Boia A (6m para tanques de 5m)
- **Vedação**: dupla vedação para evitar contaminação

#### Sensor Magnetostrutivo (montagem integrada)
- **Tipo**: a barra de onda magnetostrutiva **é** o tubo-guia
  (o flutuador magnético da boia desliza sobre ela)
- **Comprimento útil**: 5 metros
- **Material**: Aço Inoxidável 316L
- **Flutuador**: ferrite encapsulada em PTFE, tratamento oleofóbico
- **Fixação**: cabeça superior com flange, barra centrada no tanque

> Vantagem do design integrado: elimina a régua magnética separada da versão
> 1.2 e reduz BOM e pontos de falha. A boia A e a boia B usam **o mesmo
> tubo-guia**, cada uma com seu próprio flutuador magnético.

### Performance e Precisão

#### Especificações de Medição
- **Range útil**: 0,05 m - 4,95 m
- **Precisão absoluta**: ±1 mm
- **Resolução**: 0,1 mm
- **Repetibilidade**: ±2 mm (a interface oscila mais que a superfície do óleo)
- **Estabilidade**: <2mm/min (interface pode oscilar)

#### Detecção de Interface
- **Princípio**: a boia flutua *na* interface por diferença de densidade;
  a interface é a **posição medida**, não uma propriedade do fluido
- **Resolução da posição da interface**: 0,1 mm
- **Precisão absoluta**: ±1 mm
- **Confiabilidade**: >90% de detecção correta (validada por condutividade)
- **Velocidade de resposta**: <30 segundos para estabilização
- **Validação**: sensor de condutividade confirma água vs. óleo

> **Nota de engenharia (v1.3)**: "detecta diferença de 5mm entre fluidos" não
> faz sentido físico — a boia não compara fluidos, ela **se posiciona** na
> fronteira. O que se especifica é a precisão da posição dessa fronteira.

#### Condições de Teste
- **Temperatura**: 20°C ± 5°C
- **Fluido superior**: Óleo mineral ou diesel
- **Fluido inferior**: Água ou água salgada
- **Movimento**: <0,05 m/s (interface sensível)
- **Campos magnéticos externos**: <50 Gauss (limite de montagem; o sensor é
  imune a campos externos)

### Certificações e Segurança

#### Certificações ATEX
- **Zona**: 1 (presença frequente de gases)
- **Grupo**: IIB (hidrocarbonetos)
- **Categoria**: 2 (alta proteção)
- **Temperatura**: T4 (135°C superfície máxima)

#### Segurança Elétrica
- **Proteção proposta**: **Ex ib IIC T4 Gb** (energia limitada com módulo de
  potência encapsulado)
- **Corrente máxima nos circuitos Ex i**: <80mA
- **Potência máxima nos circuitos Ex i**: <400mW
- **Proteção**: PTC auto-resettable + fusível térmico

> **Nota de engenharia (v1.3)**: mesma ressalva da Boia A — um pack LiPo não
> pode ser certificado como intrinsecamente seguro por limitação de energia.
> Ver `docs/fases/fase-4-certificacoes-producao.md`.

### Algoritmos de Interface

#### Detecção Inteligente
```python
# Pseudocódigo ilustrativo. Implementação real (Ada/SPARK, com contratos):
#   firmware/src/app/interface_detector.ads
#
# Correção v1.3: a versão anterior devolvia estabilidade negativa
# (1 - amplitude/tol) quando a amplitude excedia a tolerância, e não
# clampava o resultado em [0, 1]. Abaixo a forma correta.

class InterfaceDetector:
    TOLERANCE_M = 0.010          # 10 mm de janela de estabilidade
    MIN_SAMPLES = 10
    CONFIDENCE_THRESHOLD = 85

    def detect(self, position_m, conductivity_us_cm):
        if len(self.history) < self.MIN_SAMPLES:
            return None
        if self.stability(position_m) < 0.8:
            return None
        return self.confirm(position_m, conductivity_us_cm)

    def stability(self, position_m):
        window = [h.position_m for h in self.history[-self.MIN_SAMPLES:]]
        amplitude = max(window) - min(window)
        # clamp em [0, 1]
        return max(0.0, 1.0 - amplitude / self.TOLERANCE_M)

    def confirm(self, position_m, conductivity_us_cm):
        is_water = conductivity_us_cm > 500      # µS/cm
        score = self.score(position_m, is_water)
        return score if score >= self.CONFIDENCE_THRESHOLD else None
```

#### Validação de Interface
- **Condutividade**: >500 μS/cm para água
- **Temperatura**: Comparação com sensor externo
- **Histórico**: Análise de tendência de 5 minutos
- **Confiabilidade**: Score de 0-100%

### Manutenção e Calibração

#### Procedimentos de Manutenção
```txt
Manutenção preventiva:
- Verificação visual: Mensal
- Limpeza especializada: Trimestral
- Calibração: Semestral
- Substituição bateria: Anual
- Validação sensor condutividade: Trimestral
```

#### Processo de Calibração
1. **Preparação**: Tanque com interface conhecida
2. **Posicionamento**: Boia na interface real
3. **Leitura múltipla**: 10 medições consecutivas
4. **Cálculo**: Média e desvio padrão
5. **Ajuste fino**: Calibração do algoritmo
6. **Validação**: Teste em diferentes condições

### Montagem e Instalação

#### Pré-requisitos de Instalação
- **Temperatura ambiente**: 15°C - 35°C
- **Umidade**: <80% RH
- **Interface estável**: Sem agitação excessiva
- **Acesso**: Plataforma de manutenção

#### Procedimento de Instalação
1. **Preparação**: Limpar tubo-guia completamente
2. **Instalação**: Régua magnética oleofóbica
3. **Calibração**: Interface de teste conhecida
4. **Teste**: Verificar detecção e comunicação
5. **Vedação**: Selar conexões hermeticamente

### Troubleshooting

#### Problemas Específicos da Interface

##### Problema: Falsa detecção de interface
- **Sintomas**: Boia posiciona incorretamente
- **Causas**: Emulsão óleo-água, contaminação
- **Soluções**:
  - Limpeza especializada do tubo-guia
  - Recalibração do sensor de condutividade
  - Análise de amostra do fluido

##### Problema: Oscilação excessiva
- **Sintomas**: Interface instável, leituras variando
- **Causas**: Agitação do tanque, diferença de densidade
- **Soluções**:
  - Aumentar tempo de estabilização
  - Ajustar algoritmo de média móvel
  - Verificar condições do tanque

##### Problema: Contaminação do sensor
- **Sintomas**: Leituras de condutividade incorretas
- **Causas**: Resíduos oleosos, incrustação
- **Soluções**:
  - Limpeza com solvente adequado
  - Substituição do sensor se necessário
  - Manutenção preventiva mais frequente

### Custos e Viabilidade

> **Nota de engenharia (v1.3)**: o custo-alvo anterior (R$ 350,00) não fecha
> com o BOM real. Como a **barra magnetostrutiva é compartilhada** com a Boia A
> (um sensor com dois flutuadores), o custo da Boia B não carrega o sensor.

#### Variante A — Magnetostrutivo (barra compartilhada com a Boia A)
- **Flutuador magnético + célula de condutividade**: R$ 260,00
- **Eletrônica** (STM32L0 + SX1262 + front-ends + bateria): R$ 300,00
- **Mecânica** (PP, lastro, vedação): R$ 140,00
- **Montagem e testes**: R$ 150,00
- **Total**: **R$ 850,00**

#### Variante B — Fita magnética + cabeça Hall (fita compartilhada)
- **Flutuador + célula de condutividade**: R$ 260,00
- **Cabeça de leitura Hall multiponto**: R$ 180,00
- **Eletrônica**: R$ 300,00
- **Mecânica**: R$ 140,00
- **Montagem e testes**: R$ 150,00
- **Total**: **R$ 1.030,00**

#### ROI
- **Vida útil**: 5 anos
- **Manutenção anual**: R$ 100,00 (limpeza da célula de condutividade)
- **Benefício**: detecção automática de interface
- **Payback (variante A)**: 12-18 meses
- **Payback (variante B)**: 18-24 meses

> A venda real é o **kit** (Boia A + Boia B + Gateway). Com a variante A o kit
> fica em ~R$ 4.700,00 — o payback consolidado fica em 12-18 meses, contra os
> 8-12 meses afirmados na versão 1.2 sobre um BOM irreais.

---

## 📞 Suporte e Contato

### Especificações de Garantia
- **Duração**: 24 meses
- **Cobertura**: Defeitos de fabricação
- **Exclusões**: Contaminação por fluidos inadequados
- **Suporte**: Helpdesk técnico especializado

### Documentação Relacionada
- **Firmware**: [`firmware/README.md`](../../firmware/README.md) e
  [`firmware/docs/payload.md`](../../firmware/docs/payload.md)
- **Orçamento de energia**: [`firmware/docs/energy-budget.md`](../../firmware/docs/energy-budget.md)
- [Especificações da Boia A](./boia-a-oleo.md) · [Gateway](./gateway-roteador-privado.md)

> Os documentos *Manual de Instalação Interface*, *Procedimentos de Manutenção
> Interface* e *Algoritmos de Detecção* referenciados na versão 1.2 **não
> existiam** no repositório. As referências acima apontam para o que foi de
> fato entregue.

---

*Versão: 1.3 | Revisão técnica: correção de massa/densidade, sensor, orçamento
de energia, payload binário, algoritmo de estabilidade e premissas de
segurança intrínseca*  
*Versão anterior: 1.2 | Janeiro 2024*
