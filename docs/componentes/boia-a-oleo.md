# 🟡 Componente: Boia A (Óleo) - Especificações Técnicas

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../plano-d-desenvolvimento.md).

## 📋 Visão Geral
A Boia A é projetada especificamente para medir o nível superior do óleo em tanques industriais. Utiliza materiais de baixa densidade para flutuar na superfície do óleo e manter estabilidade em condições operacionais.

## 🔧 Especificações Técnicas

### Características Físicas
- **Diâmetro**: 150mm
- **Altura**: 200mm
- **Volume externo**: 3,53 dm³ (π · 75mm² · 200mm)
- **Peso total**: 2,8 - 3,1 kg
- **Densidade operacional**: < 850 kg/m³
- **Temperatura de operação**: -10°C a 60°C

> **Nota de engenharia (v1.3)**: a massa deve fechar com a densidade alvo.
> Para flutuar sobre óleo (ρ ≈ 820-840 kg/m³) com estabilidade, a densidade
> aparente da boia precisa ficar em 780-840 kg/m³. Em 3,53 dm³ isso dá
> **2,75-2,96 kg**. As especificações anteriores (250-350g) resultariam em
> densidade aparente de ~85 kg/m³ — a boia flutuaria também sobre água e não
> se posicionaria na superfície do óleo.

### Materiais de Construção

#### Estrutura Externa
- **Material principal**: Polietileno de alta densidade (HDPE)
- **Espessura**: 4-5mm
- **Tratamento superficial**: Anti-UV e antiestático
- **Certificação**: ATEX Zone 1 compatível

#### Núcleo de Flutuação
- **Material**: Espuma de poliuretano rígido
- **Densidade**: 100-200 kg/m³
- **Volume**: 80% do volume interno
- **Compressibilidade**: <5% sob carga operacional

#### Lastro de Estabilidade
- **Material**: Aço inoxidável 316L encapsulado
- **Peso**: 350-450g (12-15% do peso total de ~3 kg)
- **Posicionamento**: Centro de gravidade inferior
- **Vedação**: Epóxi resistente a óleo

### Sistema de Sensoriamento

#### Sensor Principal: Encodador Magnetostrutivo Linear
```txt
Especificações:
- Tipo: Sensor magnetostrutivo de posição linear (float magnético)
- Range: 0-5000 mm
- Resolução: 0,1 mm
- Precisão absoluta: ±1 mm
- Interface digital: RS485 (Modbus RTU) ou SSI
- Tempo de resposta: <10 ms
- Repetibilidade: ±0,5 mm
```

> **Nota de engenharia (v1.3)**: a especificação anterior ("RFID + régua
> magnética", MFRC522 a 125kHz, resolução ±1mm) era tecnicamente incoerente.
> Leitura por tags RFID entrega resolução de ~1cm (marcas espaçadas) — para
> ±1mm em 5m seriam ~5000 tags, inviável. O MFRC522 opera a 13,56MHz, não
> 125kHz. O encodador magnetostrutivo é a tecnologia padrão de tanqueometria
> industrial e entrega ±1mm real em 5m com interface digital simples.

#### Componentes Eletrônicos
- **Front-end do sensor**: condicionamento SSI/RS485 (isolamento galvânico)
- **Microcontrolador**: STM32L432KC (ARM Cortex-M4F, 256KB Flash, 64KB RAM)
- **Módulo LoRa**: SX1262 (915MHz, consumo reduzido em sleep)
- **Bateria**: LiPo 3.7V 2600mAh (módulo encapsulado)
- **Sensor de temperatura**: DS18B20 (-55°C a +125°C)

### Sistema de Energia

#### Bateria Principal
- **Tipo**: Lítio-polímero (módulo encapsulado com circuito de proteção)
- **Capacidade**: 2600mAh
- **Tensão**: 3.7V nominal
- **Ciclos de vida**: >500 ciclos completos
- **Proteção**: Overcharge / over-discharge / curto-circuito / PTC

> **Nota de engenharia (v1.3)**: a versão anterior especificava 1000mAh com
> "autonomia de 30-45 dias" a 1 leitura/min. A aritmética não fecha: a própria
> folha de dados declarava 0,5mA de consumo em sleep, que sozinho drena a
> bateria em ~83 dias — e o consumo médio do duty cycle de 1 leitura/min
> excederia os 30 dias. Os números abaixo são o orçamento calculado.

#### Painel Solar (Opcional)
- **Potência**: 1W
- **Eficiência**: >15%
- **Dimensões**: 100mm x 60mm
- **Controlador**: carga CC/CV simples (não requer MPPT nesta potência)

#### Orçamento de Energia (1 leitura/min, SF9BW125)

> Números calculados pelo modelo executável em `firmware/src/app/energy_mgr`
> e fixados por teste em `firmware/tests/test_energy.adb`. Se os parâmetros
> de consumo mudarem, os testes falham e este bloco deve ser atualizado.

```txt
Evento (a cada 60s):
  Acordar + leitura sensor + processamento   25 mA  por  25 ms
  TX LoRa 12 bytes (SF9)                    45 mA  por 270 ms
  Janelas RX1/RX2 (classe A)              5,5 mA  por 540 ms
  Tempo ativo por ciclo                                835 ms
  Energia por ciclo                   16.928.300 uA*ms = 0,0047 mAh

Consumo por modo:
  Sleep profundo (STOP2 + SX1262 sleep):    20 uA
  Sleep contínuo (24 h):                    0,48 mAh/dia
  Corrente média (1440 ciclos/dia):        282 uA = 6,77 mAh/dia

Autonomia calculada (bateria 2600 mAh):
  SF9  (2-5 km), 80% utilizável:   307 dias  (~10,1 meses)
  SF9  (2-5 km), 100% nominal:     383 dias  (~12,6 meses)
  SF12 (5-10 km), 80% utilizável:   72 dias  (~2,4 meses)
  Com painel 1W:                    indefinida em regime nominal
```

> Os consumos de sleep anteriores (0,5mA) eram irreais para STM32L4 em STOP2 +
> SX1262 em sleep (20µA combinados). Corrigidos conforme datasheets.

### Comunicação

#### Protocolo LoRaWAN
- **Frequência**: 915MHz (Brasil)
- **Spreading Factor**: 7-12 (adaptativo)
- **Bandwidth**: 125kHz
- **Potência TX**: +14dBm (25mW)
- **Alcance**: 2-5km (campo aberto)

#### Formato do Payload (Uplink)

> **Nota de engenharia (v1.3)**: o payload JSON anterior (~180 bytes) não cabe
> no LoRaWAN — em US915/BR915 o payload de aplicação máximo é **19 bytes** em
> DR0 (SF10BW125). O frame abaixo tem 12 bytes e usa codificação binária.

```txt
Offset  Campo           Tam  Tipo    Range / Unidade
------  --------------  ---  ------  --------------------------
  0     device_id        2   u16     0..65535 (ID lógico)
  2     seq              1   u8      contador de uplink (wrap)
  3     flags            1   bitset  b0=calib_valid  b1=alerta
                                     b2=bateria_baixa  b3=interface_ok
                                     b4..7 = reservados (ignorados)
  4     position_mm      2   u16     0..5000 (mm)
  6     temp_ddegc       2   i16     -100..600 (0,1 °C, complemento de dois)
  8     battery_pct      1   u8      0..100 (%)
  9     rssi_enc         1   u8      0 = desconhecido; 1..129 = rssi_dbm + 129
 10     confidence       1   u8      0..100 (100 = não aplicável)
 11     crc8             1   u8      CRC-8/ATM, poly 0x07, init 0x00
------  --------------  ---  ------  --------------------------
TOTAL                    12 bytes   (limite DR0 = 19 bytes)
```

- **Byte order**: big-endian (network order)
- **Validação**: CRC-8 sobre os 11 primeiros bytes; frame inválido é descartado
- **Mapeamento**: `position_mm` → volume via tabela de arqueação no gateway/backend
- **Decodificador**: implementado em `firmware/src/app/payload_codec` (fonte
  única de verdade) e reimplementado no gateway/backend

Exemplo de frame (Boia A: device_id=1, seq=42, calib_valid, posição 2340 mm,
28,5 °C, bateria 85%, RSSI -78 dBm, confiança 100):
```txt
00 01 2A 01 09 24 01 1D 55 33 64 0D
\____/ |  |  \____/ \____/ |  |  |  \-- crc8 = 0x0D
   |   |  |     |      |    |  |  \---- confidence = 100 = 0x64
   |   |  |     |      |    |  \------- rssi_enc = -78 + 129 = 51 = 0x33
   |   |  |     |      |    \---------- battery = 85 = 0x55
   |   |  |     |      \--------------- temp = 285 = 0x011D
   |   |  |     \---------------------- position = 2340 = 0x0924
   |   |  \---------------------------- flags = 0x01 (calib_valid)
   |   \------------------------------- seq = 42 = 0x2A
   \----------------------------------- device_id = 1 = 0x0001
```

> Esses bytes são a **saída real** de `Payload_Codec.Encode` e estão fixados
> como vetor de ouro em `firmware/tests/test_payload.adb`. Um decodificador em
> Python/C que não reproduzir esse resultado está errado.

### Sistema de Fixação

#### Tubo-Guia
- **Material**: PVC Schedule 80 ou Aço Inoxidável 316L
- **Diâmetro interno**: 25mm
- **Comprimento padrão**: 6 metros
- **Fixação superior**: Flange soldável
- **Vedação**: O-ring de silicone

#### Sensor Magnetostrutivo (montagem)
- **Tipo**: Barra de onda magnetostrutiva com flutuador magnético
- **Comprimento útil**: 5 metros
- **Material**: Aço Inoxidável 316L (contato com óleo)
- **Flutuador**: Ferrite encapsulada em PTFE, Ø25mm
- **Fixação**: Cabeça superior com flange, barra centrada no tubo-guia

> A "régua magnética flexível" da versão anterior pertencia ao esquema de
> leitura por tags RFID, que foi descartado. No encodador magnetostrutivo a
> referência de posição é a própria barra de onda — não há fita magnética.

### Performance e Precisão

#### Especificações de Medição
- **Range útil**: 0,1 m - 4,9 m
- **Precisão absoluta**: ±1 mm
- **Resolução**: 0,1 mm
- **Repetibilidade**: ±0,5 mm
- **Estabilidade**: <0,5 mm/min (condições estáveis)

#### Condições de Teste
- **Temperatura**: 20°C ± 5°C
- **Fluido**: Óleo mineral ou diesel
- **Movimento**: <0,1 m/s
- **Campos magnéticos externos**: <50 Gauss (o sensor é imune a campos
  externos; limite refere-se à montagem)

### Certificações e Segurança

#### Certificações ATEX
- **Zona**: 1 (presença frequente de gases)
- **Grupo**: IIB (hidrocarbonetos)
- **Categoria**: 2 (alta proteção)
- **Temperatura**: T4 (135°C superfície máxima)

#### Segurança Elétrica
- **Proteção proposta**: **Ex ib IIC T4 Gb** (energia limitada com módulo de
  potência encapsulado)
- **Limite de energia**: circuitos de medição Ex i (Ui/Ii/Pi conforme
  entidade FISCO); barramento de potência em módulo selado
- **Corrente máxima nos circuitos Ex i**: <100mA
- **Potência máxima nos circuitos Ex i**: <500mW
- **Proteção**: PTC auto-resettable + fusível térmico

> **Nota de engenharia (v1.3) — risco de certificação**: a versão anterior
> declarava "intrinsecamente segura" para um pack LiPo de 1000-2600mAh. Uma
> célula LiPo entrega dezenas de amperes em curto-circuito e **não pode ser
> certificada como Ex i** por limitação de energia. A via realista é:
> (a) módulo de bateria encapsulado (Ex e/Ex d) com limitação na saída, ou
> (b) bateria selada de circuito limitado homologada para Zone 1.
> Isso muda o custo de BOM e deve entrar no FMEA e no orçamento de
> certificação — ver `docs/fases/fase-4-certificacoes-producao.md`.

### Manutenção e Calibração

#### Procedimentos de Manutenção
```txt
Manutenção preventiva:
- Verificação visual: Mensal
- Limpeza externa: Trimestral
- Calibração: Semestral
- Substituição bateria: Anual
```

#### Processo de Calibração
1. **Posicionamento**: Boia em posição conhecida
2. **Leitura**: Registrar valor do sensor
3. **Ajuste**: Calcular offset de calibração
4. **Validação**: Testar em múltiplos pontos
5. **Registro**: Salvar parâmetros no dispositivo

### Montagem e Instalação

#### Pré-requisitos de Instalação
- **Temperatura ambiente**: 15°C - 35°C
- **Umidade**: <80% RH
- **Espaço livre**: 50cm ao redor do tubo-guia
- **Acesso**: Plataforma ou escada para manutenção

#### Procedimento de Instalação
1. **Preparação**: Limpar e preparar tubo-guia
2. **Fixação**: Instalar régua magnética
3. **Calibração**: Posicionar boia em ponto zero
4. **Teste**: Verificar comunicação e medição
5. **Vedação**: Selar todas as conexões

### Troubleshooting

#### Problemas Comuns e Soluções

##### Problema: Comunicação LoRa fraca
- **Sintomas**: Pacotes perdidos frequentes
- **Causas**: Obstáculos, interferência, bateria baixa
- **Soluções**:
  - Verificar linha de vista
  - Ajustar posição da antena
  - Substituir bateria

##### Problema: Precisão reduzida
- **Sintomas**: Leituras erráticas
- **Causas**: Calibração desatualizada, sujeira no tubo-guia, flutuador magnético desmagnetizado
- **Soluções**:
  - Recalibrar sensor (procedimento multiponto)
  - Limpar tubo-guia
  - Verificar integridade da barra magnetostrutiva e do flutuador magnético

##### Problema: Consumo excessivo de energia
- **Sintomas**: Bateria dura menos de 20 dias
- **Causas**: Firmware bugado, transmissões excessivas
- **Soluções**:
  - Atualizar firmware
  - Ajustar intervalo de transmissão
  - Verificar painel solar

### Custos e Viabilidade

> **Nota de engenharia (v1.3)**: o custo-alvo anterior (R$ 420,00) era
> incompatível com o BOM real. Um encodador magnetostrutivo industrial de 5m
> custa, sozinho, entre R$ 1.800 e R$ 3.500. As duas variantes abaixo são as
> viáveis — **a variante A é a especificada**, a B é a opção de custo.

#### Variante A — Magnetostrutivo (especificada)
- **Sensor magnetostrutivo 5m**: R$ 2.400,00
- **Eletrônica** (STM32L4 + SX1262 + front-end + bateria): R$ 320,00
- **Mecânica** (HDPE, espuma, lastro, tubo-guia): R$ 180,00
- **Montagem e testes**: R$ 150,00
- **Total**: **R$ 3.050,00**

#### Variante B — Fita magnética + cabeça Hall (opção de custo)
- **Fita magnética codificada 5m (passo 1mm)**: R$ 120,00
- **Cabeça de leitura Hall multiponto**: R$ 180,00
- **Eletrônica**: R$ 320,00
- **Mecânica**: R$ 180,00
- **Montagem e testes**: R$ 150,00
- **Total**: **R$ 950,00**
- **Precisão resultante**: ±2 mm (vs. ±1 mm da variante A)

#### ROI
- **Vida útil**: 5 anos
- **Manutenção anual**: R$ 80,00
- **Benefício**: eliminação de medições manuais
- **Payback (variante A)**: 24-36 meses
- **Payback (variante B)**: 10-15 meses

> O payback de 8-12 meses citado nas versões anteriores pressupunha o BOM de
> R$ 420,00. Com a variante B o valor original volta a ser realista; com a
> variante A o caso de negócio deve ser justificado por precisão e por
> redução de risco operacional, não por payback.

---

## 📞 Suporte e Contato

### Especificações de Garantia
- **Duração**: 24 meses
- **Cobertura**: Defeitos de fabricação
- **Exclusões**: Danos por uso inadequado
- **Suporte**: Helpdesk técnico disponível

### Documentação Relacionada
- **Firmware**: [`firmware/README.md`](../../firmware/README.md) e
  [`firmware/docs/payload.md`](../../firmware/docs/payload.md)
- **Orçamento de energia**: [`firmware/docs/energy-budget.md`](../../firmware/docs/energy-budget.md)
- [Especificações da Boia B](./boia-b-interface.md) · [Gateway](./gateway-roteador-privado.md)

> Os documentos *Manual de Instalação*, *Procedimentos de Manutenção* e
> *Firmware Specifications* referenciados na versão 1.2 **não existiam** no
> repositório. As referências acima apontam para o que foi de fato entregue.

---

*Versão: 1.3 | Revisão técnica: correção de massa/densidade, sensor, orçamento
de energia, payload binário e premissas de segurança intrínseca*  
*Versão anterior: 1.2 | Janeiro 2024*
