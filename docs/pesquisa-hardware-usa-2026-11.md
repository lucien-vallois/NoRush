# Estudo de Seleção de Componentes — NoRush · Flowback Intelligence

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](plano-d-desenvolvimento.md).

Sistema IoT de monitoramento de nível em tanques de flowback (produced water / óleo) — Novembro/2026.

Relatório de pesquisa de mercado US para o hardware das bóias. Preços verificados via busca web em novembro/2026; preços de distribuidores flutuam — trate tudo como ordem de grandeza salvo onde indicado. Itens incertos ou em mudança estão sinalizados com ⚠.

---

## 1. Seleção de MCU: baseline STM32L4/L0 vs. alternativas acessíveis nos EUA

**Contexto do baseline:** o STM32L432KC segue em produção e com estoque na Mouser (~2.300 un. a ~US$ 5,90 qty 1), mas a ST estendeu lead times de fábrica para ~52 semanas em várias famílias (incl. L4), e o preço qty-1 na Digi-Key chega a ~US$ 13. O STM32L072 (L0) é família legada: a própria ST posiciona o STM32U0 como sucessor (Stop 1 = 450 nA, Standby = 300 nA, Shutdown = 16 nA, a partir de ~US$ 0,68 @1k, estoque saudável, guia de migração AN6091). Manter ST é viável, mas para projeto novo existe melhor custo-benefício se você quer rádio integrado.

**O insight estrutural do seu caso:** você precisa de (a) MCU ultra-low-power, (b) rádio LPWAN e (c) possivelmente GNSS. Comprar um SiP/módulo pré-certificado FCC que já contém MCU + modem (nRF9151) ou MCU + LoRa em um chip (STM32WLE5 via módulo RAK3172) elimina design de RF, certificação FCC própria e uma peça da cadeia de suprimentos. Para solo dev nos EUA, isso pesa mais que 2 µA a mais de Stop current.

| Opção | Rádio | Sleep (datasheet) | Preço qty 1 / @1k (US$, aprox.) | Stock EUA | Toolchain | Notas |
|---|---|---|---|---|---|---|
| **Nordic nRF9151 SiP** | LTE-M + NB-IoT + NTN (Skylo) + GNSS, DECT NR+ | PSM floor 2,7 µA (medido c/ eDRX: ~13 µA no DK) | ~$23 / ~$15,76 (Newark/DK) | Sim (DK, Mouser, Newark) | nRF Connect SDK (Zephyr) 1ª classe; Rust possível (ver §9) | MCU Cortex-M33 + modem no mesmo SiP; DK ~$102. **Melhor "cérebro único" para o projeto** |
| STM32L432KC (baseline) | nenhum | Stop2 ~1,1 µA | $5,90–13,71 / ~$3,90@3k | Mouser ~2.300 un.; lead 52 sem. | STM32Cube, Rust (stm32-rs maduro), SPARK ok | Bom MCU, mas exige rádio externo (SX1262/E22) + certificação |
| STM32U0 (sucessor do L0) | nenhum | Stop1 450 nA, Shutdown 16 nA | ~$2,49–3,65 / $0,68@1k | Sim | Cube, Rust | Só se fizer LoRa com SX1262 discreto |
| **STM32WLE5 via módulo RAK3172** | LoRa/FSK sub-GHz integrado | ~1,9–3 µA (módulo sleep) | $10,27 módulo (DK) | Sim (Digi-Key) | STM32CubeWL, Arduino, AT | Alternativa Seeed LoRa-E5 ~$7–8. Caminho LoRa mais barato e pré-certificado |
| TI MSPM0G3507 | nenhum | ~1 µA standby (STOP com RTC) | ~$2–3 / <$2 | LaunchPad com lead ~12 sem. na DK; chips ativos | CCS, Keil, IAR; sem Rust oficial maduro | Barato, mas sem rádio e ecossistema menor p/ IoT |
| TI MSP430FR (FRAM) | nenhum | LPM3 ~1–2 µA c/ RTC | $2–5 | Sim | CCS; Rust experimental | Diferencial FRAM irrelevante aqui |
| Silicon Labs EFM32BG22 / BGM240 | BLE 5.2 | ~1,2–1,4 µA deep sleep | SoC ~$3–4; módulo BGM240 $10,71 | Sim (DK) | Simplicity Studio; integração com Hubble Network (satélite BLE) | Rota para satélite Hubble (ver §3c) |
| Nordic nRF52840 | BLE + 802.15.4 | System ON ~1,6–2 µA | ~$7–9 / ~$4–5 (aprox.) | Excelente | nRF Connect, Rust (nrf-hal) maduro | Ótimo se o rádio principal for LoRa/celular externo e BLE for diagnóstico |
| Microchip SAM L21 / SAM R34 | SAM R34: + LoRa SiP | Standby ~840–940 nA; R34 sleep 790 nA | SAML21 ~$5–10; R34/R35 ~$8,57 | Sim | Atmel Studio/Microchip Studio; Rust parcial | Competente, mas ecossistema menor que Nordic/ST |
| Espressif ESP32-C6 | WiFi 6 + BLE + Thread/Zigbee | Deep sleep ~7 µA (real board >) | $4,80 módulo / devkit $8–9 | Excelente | esp-idf, esp-rs (Rust) maduro | **Somente prototipagem/bench** — consumo e qualificação industrial fracos para campo |
| NXP (ex. LPC84M / i.MX RT) | nenhum | comparável | ~$2–6 | Sim | MCUXpresso | Sem diferencial claro aqui; menor comunidade IoT |

**Safety-critical path (SPARK/Ada/Rust):** GNAT/SPARK Pro suporta bareboard ARMv7-M em diante (Cortex-M), incluindo ESP32 (Xtensa) — ver §9 para o trade-off real. Rust: produção-comprovado em nRF52 (nrf-hal), esp-rs e stm32-rs; para o modem do nRF9151 o caminho prático é Zephyr + app em C, com Rust crescendo (Zephyr 4.1+ aceita app code em Rust).

**Recomendação MCU:** abandone o par L432+L072 como centro do design. **nRF9151** se o plano for LTE-M/satélite (opção B/C); **RAK3172 (STM32WLE5)** se for LoRaWAN privado (opção A/campo próximo); **ESP32-C6** só no bench.

---

## 2. Sensoriamento de nível + interface óleo/água em tanques de flowback

Correções factuais: **Banner LTF é laser time-of-flight, não radar** (US$ 470–555; o radar da Banner existe em outras linhas, preço via cotação); **Sensopart não tem linha radar level**. Quem tem 80 GHz com distribuição e preço público nos EUA: VEGA, ifm, Flowline, AutomationDirect (ProSense), BinMaster, Keyence (cotação).

| Tecnologia | Exemplos (US) | Preço aprox. (US$) | Falha em produced water / vapor / espuma | Interface óleo/água |
|---|---|---|---|---|
| **Radar 80 GHz não-contato (no teto, olhando p/ baixo)** | VEGAPULS 64 (list ~$4.300; street/eBay $780–1.900); ifm LW2720 ($2.600 na RS US); Flowline 80 GHz ($835–1.110); genéricos ATO/eBay ($319–1.556) | $320–4.300 | **Melhor opção**: atravessa vapor/espuma leve; imune a condensação; sem parte molhada | Não mede interface diretamente (reflete na superfície do óleo) |
| Guided Wave Radar (GWR, sonda molhada) | AutomationDirect ProSense GWR **$863**; E+H, VEGA, Magnetrol (cotação) | $860–2.500 | Sonda em contato c/ brine (316L/Hastelloy); emulsão grossa pode perder o eco | **Sim — método padrão p/ interface** (óleo εr~2–3 vs água εr~80), limitação na emulsão/rag layer |
| Hidrostático submerso | APG PT-500 (316L): $664–1.224; dirty-liquid ~$1.160; Hastelloy $1.100–1.400 | $660–1.400 | Corrosão, incrustação, H2S, derivas; cabo/selo são o ponto fraco | Indireto: 2 sensores + multivariada, ou interface por densidade |
| Ultrassônico (não-contato, teto) | MaxBotix MB7360 **$183–224** (DK); Banner LTF (laser) $470–555 | $180–550 | **Falha conhecida**: espuma absorve o som, vapor/condensação causam eco perdido — crônico em flowback | Não |
| Capacitivo / RF admissância | Drexelbrook (cotação, ~$1–3k típico) | $1.000–3.000 | Eletrodo molhado; brine condutiva facilita detecção água vs óleo | **Sim, clássico** em separators; array de eletrodos resolve ~1 cm |
| Bóia/float + magnetoestritivo | Gems, Magnetrol | $200–1.500 | Bóia afunda/emaranha com emulsão; sujeira mecânica | Sim (bóia de densidade intermediária), frágil em flowback sujo |
| Térmico (thermal dispersion, switch pontual) | AMETEK Thermatel TD1/TD2 | $800–2.000 | Robusto; só ponto, não contínuo | Sim (switch de interface p/ dump control) |

**Interface óleo/água — como pensar:** nível de superfície (topo do óleo) → radar 80 GHz no teto; interface óleo/água → GWR de dupla-interface (melhor exatidão, ~$860+ ProSense) ou capacitância/RF em bóia/eletrodos (mais barato para protótipo, mais sujeito à rag layer). Para o protótipo, um GWR de US$ 863 na AutomationDirect com leitura de interface via display/RS-485 é o atalho mais curto para dados reais.

**Por que radar na bóia/teto > pressão submersa em brine:** sem parte molhada = sem corrosão por cloreto/H2S, sem incrustação de escala e parafina, sem dano mecânico no cabo, calibração estável, manutenção sem drenar o tanque. O hidrostático submerso é o que falha primeiro em produced water agressiva — a menos que seja Hastelloy/titânio (e aí custa mais que o radar de entrada).

---

## 3. Conectividade para oilfields remotos nos EUA (Permian, Bakken)

### (a) LoRaWAN US915
- **Rede privada é a opção séria**: um gateway cobre 2–15 km em área rural; LoRa Alliance tem white paper de oil & gas. Gateway RAK7268 ~US$ 150–250; Milesight UG65 ~US$ 200–300. Gateway solar+LTE existe (TEKTELIC etc.) para o backhaul.
- **TTN (comunitária)**: gratuito, mas cobertura em Permian/Bakken é virtualmente inexistente — útil só para desenvolvimento. Fair-use limita tráfego comercial.
- **⚠ Helium**: viva em 2026 (DePIN na Solana), mas utilidade real em oilfield remoto questionável e cobertura não-contratual. Não faça piloto comercial depender dela.
- **Custo**: US$ 0/dispositivo/mês + CAPEX do gateway (US$ 200–600) + backhaul celular do gateway (~US$ 5–10/mês compartilhado por dezenas de nós). Nó: RAK3172 ($10) + antena.
- Encaixa no backend: The Things Stack ou **ChirpStack self-hosted** → integração MQTT/JSON direto no broker da plataforma.

### (b) Celular LTE-M / NB-IoT
Cobertura: no Permian a cobertura AT&T/Verizon é geralmente boa perto de rodovias e baterias de tanques, mas há zonas sem sinal — por isso o plano (c).

| Provedor | Plano típico 2026 | Custo/mês por dispositivo (~2–5 MB) |
|---|---|---|
| Verizon (ThingSpace) | "as low as $1,10/device/month"; 1 GB/ano $20 compartilhável até 20 dispositivos + $1/dispositivo/mês | ~$2–3 |
| AT&T IoT | históricos desde $1,50; hoje cotação por volume | ~$1,50–5 |
| T-Mobile IoT/M2M | negotiation-only (relatos ~$2/SIM via revenda) | ~$2 |
| Monogoto (MVNO global) | $1/SIM base + dados | ~$1,05–1,50 |
| Hologram | ~$1,50 base + ~$0,40/MB | ~$2,30–3,50 |
| Soracom | pay-go/plan01k | ~$1–2 |
| ⚠ Twilio Super SIM | Twilio saiu de IoT — vendido para KORE (2023–24); relatos de instabilidade | — |

**NB-IoT terrestre nos EUA é fraco — LTE-M é o padrão americano.** Não projete em torno de NB-IoT terrestre.

### (c) Satélite IoT — status novembro/2026
| Provedor | Status 2026 | Hardware | Custo serviço | Observações |
|---|---|---|---|---|
| **Skylo (NB-NTN)** | Ativo, 16 M dispositivos (mai/2026); ⚠ constelação em reorganização (EchoStar→Starlink; Ligado→AST; Viasat/Space42 "Equatys" é o esteiro do L-band) | nRF9151 já faz NTN; DK SMA ~$130 | Via Monogoto: $1/mês/SIM + $0,30/KB (blocos de 50 B) | Caminho mais barato p/ "sem cobertura celular" no hardware principal. Certificação de dispositivo Skylo: $4.000 (integrado) / $7.500 (módulo) |
| **Hubble Network (BLE→sat)** | GA desde set/2026, Series C $200 M (val. $1,6 B); dev portal aberto | Chips BLE padrão (SiLabs BG22/BGM240, TI) — BOM extra <$0,50 | $1–2/dispositivo/mês | ⚠ Novíssimo: payloads minúsculos (dezenas de bytes), latência não-garantida; validar restrições antes |
| Iridium (SBD 9603) | Maduro, cobertura polar global | Módulo 9603 ~$250–350; RockBLOCK ~$230–280 | RockBLOCK ~$12/mês + ~$0,50/msg → 6 msg/dia ≈ $90+/mês | Caro; só se cliente exigir |
| ⚠ ORBCOMM | OG2 envelhecendo; pivô p/ OGX fechado | Não há módulo aberto prático | — | **Evite para design próprio** em 2026 |

### (d) Recomendação por cenário
- **Pátio/pilot yard (<5 km)**: LoRaWAN privado — $0/mês por nó, dados no seu broker.
- **Campo remoto com celular (maioria do Permian perto de estradas/batteries)**: LTE-M (Monogoto ou Verizon) — $1–3/dispositivo/mês.
- **Campo sem celular**: nRF9151 + Skylo via Monogoto — a cada 4 h (~6 msg/dia, ~100 B) ≈ $5–6/mês; 15 min via satélite é inviável ($0,30/KB). Hubble a $1–2/mês como experimento paralelo.

---

## 4. Localidades perigosas (hazardous locations) — regras EUA

- **Divisions (NEC Art. 500) vs Zones (NEC Art. 505)**: Class I Div 2 ≈ Zone 2; Div 1 ≈ Zone 0/1. ATEX/IECEx **não são automaticamente aceitos** nos EUA — o equivalente é certificação por NRTL (UL, FM Approvals, CSA) contra ANSI/ISA/UL 60079-series e UL 913.
- **"Intrinsically safe" (IS)** = limitação de energia (tensão/corrente/indutância/capacitância) com barreiras/entity parameters, avaliado sob UL 913 / ANSI/ISA 60079-11. Em Div 2/Zone 2, IS é opcional — aceita-se "non-incendive" (ANSI/ISA 12.12.01), invólucro à prova de explosão, purga. A classificação exata da área é do operador do site, não sua.
- **Postura realista do protótipo:**
  - PODE: eletrônica **fora do espaço de vapor** (parede externa do tanque, caixa selada), sensor industrial de 3ª parte com aprovação Ex própria (radar VEGA/ifm/Flowline c/ Class I Div 2 ou IS), cabo por gland selado, bateria/solar isolada. Isso é "instalação em área classificada usando componentes certificados" — não é o seu device certificado.
  - NÃO PODE: colocar bóia/bateria/rádio custom dentro do vapor e chamar de "intrinsically safe" ou "Div 2 rated". Sem certificado de NRTL, qualquer afirmação de segurança é marketing indevido.
- **Caminho de certificação se comercializar:** alvo inicial **Class I Div 2 / Zone 2 non-incendive** (bem mais barato), depois IS. Custos: **US$ 10k–100k+, 4–9 meses**. Adicione Skylo device cert ($4k) se usar NTN. Projete desde já: energia limitada, derating, documentação de assessment.

---

## 5. Energia

**Químias:**
- **Li-SOCl₂ D-cell**: Saft LS33600 ~17 Ah (US$ 24–38); Tadiran TL-5930/S 19 Ah (~US$ 38). Autodescarga ~1%/ano; atenção à passivação — use capacitor híbrido (LIC) em paralelo para pulsos do rádio.
- **LiFePO₄ + solar**: painel Voltaic 2 W $21 / 5 W $35; MPPT CN3791-class (~$10–15) para LiFePO₄ 18650 (química recomendada: 2.000–3.000+ ciclos, seguro).

**Matemática de bateria — cenário recomendado (nRF9151, LTE-M, relatório a cada 15 min, 96 ciclos/dia, sem GNSS):**

| Estado | Corrente | Duração | Carga/dia |
|---|---|---|---|
| Sleep PSM (SiP 2,7 µA + placa ~2 µA) | ~5 µA | contínuo | 0,12 mAh |
| Medição sensor (96×) | ~60 mA | 3 s cada | 4,8 mAh |
| Uplink LTE-M (96×) | ~120 mA média | ~3 s cada | 9,6 mAh |
| **Total** | | | **~14,5 mAh/dia ≈ 5,3 Ah/ano** |

→ Tadiran TL-5930/S 19 Ah: ~3,6 anos teórico; ~2,5 anos com derating. Com uplink otimizado (RAI, boa RSSI) cai para ~5–6 mAh/dia → 5+ anos.

**LoRaWAN (RAK3172) a cada 15 min:** ≈ 6,3 mAh/dia ≈ 2,3 Ah/ano → 19 Ah D-cell ≈ 8 anos teóricos, ~5 realistas.

**Skylo NTN (a cada 4 h):** ≈ 3–5 mAh/dia — compatível com D-cell por anos; o custo por byte (não a energia) é o que força a cadência 4h.

**Solar para LTE-M:** carga 52 mWh/dia vs painel 2 W × 4 h × derate 0,5 ≈ 4 Wh/dia — folga enorme; dimensione bateria para **autonomia ≥ 30 dias sem sol**. ⚠ Se usar sensor industrial com loop 4–20 mA contínuo (~0,5–1 W), o standby do sensor domina o orçamento energético, não o rádio — verifique o consumo do sensor escolhido.

---

## 6. Mecânica / corrosão (brine + H2S + vapor)

- **Materiais**: 316L listado no NACE MR0175/ISO 15156-3 para sour service com condições (dureza ≤22 HRC, sem cold-work, limites de temperatura/cloreto). Para produced water quente/ácida: 904L, duplex 2205 ou Hastelloy C-276 nas partes molhadas. Estratégia "não molhar nada": 316L no invólucro + HDPE/PVC/PTFE em isoladores e bóia.
- **Proteção**: IP68 mínimo, IP69K se lavagem de alta pressão. Enclosures 316L IP68 US$ 60–250; vent PTFE (Gore).
- **Conectores**: Conxall Mini-Con-X IP68/NEMA 6P ~US$ 30–65/par (Digi-Key); Bulgin Buccaneer; bulkhead N/SMA com cap selado para antena.
- **Antena**: mastro curto acima do tanque, 3–5 dBi, dentro dos tipos aprovados no certificado do módulo.

---

## 7. Prototipagem + produção de baixo volume nos EUA

| Fornecedor | Papel | Custos realistas |
|---|---|---|
| **MacroFab (Houston, TX)** | Turnkey PCBA, quote em <15 min | placa simples $20–80/un., moderada $80–150/un. qty protótipo (excl. BOM) |
| Sunstone (OR) | Fab + assembly | fab 2–4 camadas a partir de ~$100/run |
| PCBWay (facilidade US) | Fab US (evita tarifa de PCB chinês); assembly RFQ | fab ~$5/10 placas (promo); China 3–5× mais barato c/ incerteza aduaneira |
| JLCPCB / PCB:NG | Bench / assembly local NY | melhor custo absoluto p/ bench |

**Regra prática 5–10 placas**: espere **US$ 150–400/placa tudo somado (BOM incluso)** para telemetria de complexidade média em MacroFab/PCBWay-US.

**Módulos vs. discreto:** para o rádio, **sempre módulo pré-certificado em qty <1.000** (nRF9151 $23; RAK3172 $10; BGM240 $10,71; LoRa-E5 $7). Economiza US$ 10–50k de certificação FCC/PTCRB/carrier e semanas de tuning RF.

---

## 8. Regulatório — FCC Part 15

- Intentional radiator (LoRa 15.247, BLE/WiFi): exige Certification (FCC ID) antes de vender; **módulo com Full Modular Approval (KDB 996369)** transfere para o fabricante do módulo — siga o integration guide e faça o **Part 15 Subpart B do produto final** (~US$ 1,5–4k).
- Módulo celular (nRF9151): FCC + PTCRB/carrier já cobertos pelo SiP/DK; operadora pode exigir registro IMEI (burocracia).
- Antenas: §15.203 — use exatamente as antenas/ganhos listados no grant do módulo.
- Dev kit permite avaliação/teste privado antes de certificação; não vender/instalar comercialmente o end-product antes de completar a cadeia.

---

## 9. Ecossistema de firmware (backend fala MQTT/JSON sobre TLS)

| Opção | Maturidade | Vantagem | Risco |
|---|---|---|---|
| **Zephyr RTOS via nRF Connect SDK** | 1ª classe no nRF9151 (modem, MQTT, TLS, CoAP, LwM2M, FOTA) | Menor time-to-first-telemetry; samples MQTT/TLS prontos | Curva (devicetree/Kconfig/west); C |
| **Rust embedded** | nrf52/esp-rs maduros; nRF9151 atrás do 9160; Zephyr 4.1+ aceita Rust | Memória-safety, **muito procurado no mercado dos EUA em 2026** | Camada de modem do 9151 exige trabalho próprio ou AT |
| **Ada/SPARK (GNAT Pro)** | Bareboard Cortex-M suportado | Prova formal inigualável; continuidade c/ protótipo atual | Licença comercial cara; comunidade mínima nos EUA; sem integração Zephyr — reescreve MQTT/TLS na mão |

**Recomendação:** firmware principal em **nRF Connect SDK (Zephyr) + C** para destravar modem/TLS/MQTT rápido; portar gradualmente lógica de aplicação para **Rust**. Ada/SPARK apenas como módulo crítico pequeno, não como fundação. Payload JSON compacto (ou CBOR) a cada 15 min cabe folgado em LTE-M.

---

## 10. RECOMENDAÇÃO FINAL — 3 arquiteturas com part numbers

### (A) Protótipo de bancada/pátio — BOM ~US$ 60–280/nó
| Bloco | Parte | Preço |
|---|---|---|
| MCU+rádio | ESP32-C6-DEVKITC-1-N8 (bench) ou Seeed Wio-E5 (pátio, LoRa) | $9 / $26,90 |
| Sensor | Bancada seca: A02YYUW ultrasonic ~$5; pátio: MaxBotix MB7360 $183–224 | $5–224 |
| Gateway (se LoRa) | RAK7268 US915 | ~$200 único |
| Energia | power bank / 2×18650 + boost | $15 |
| **BOM/nó** | | **~$60 (seco) / ~$280 (pátio)** |
| Conectividade/mês | $0 (WiFi / LoRa privado) | **$0** |

Valida o pipeline MQTT→NestJS→TimescaleDB e a mecânica; sem claim de área classificada; ultrassônico mente com espuma — parte do aprendizado.

### (B) Piloto de campo profissional SEM certificação hazloc — BOM ~US$ 1.200–2.100 (qty 1)
| Bloco | Parte | Preço |
|---|---|---|
| MCU+rádio | nRF9151-LACA SiP ($23) na placa própria (MacroFab), ou DK qty 1 ($102) | $23–102 |
| Sensor nível (não-contato, fora do vapor) | Flowline 80 GHz radar ($835–1.110) ou VEGAPULS 64 street ~$1.900 | $835–1.900 |
| Interface óleo/água (opcional) | AutomationDirect ProSense GWR $863 (dupla-interface) | $863 |
| Energia | 2× Tadiran TL-5930/S ($76) ou Voltaic 2 W + MPPT + 2×18650 | $60–110 |
| Caixa/conn | 316L IP68 + Conxall + gland + antena | $150–330 |
| SIM | Monogoto/Verizon | ~$1–3/mês |
| Placa própria | MacroFab/PCBWay-US 5 un. | ~$150–400/placa |
| **BOM qty 1 (nível) / (nível+interface)** | | **~$1.200 / ~$2.100** |
| **BOM qty 10** | | **~$950 / ~$1.700** |

Claim honesto: eletrônica fora do espaço de vapor; sensores com aprovação própria; dispositivo NÃO certificado para área classificada — instalação sujeita à permissão do operador.

### (C) Rascunho do caminho para produto certificado
- **Hardware**: nó nRF9151 (LTE-M primário + Skylo NTN fallback no mesmo SiP; BLE p/ commissioning); sensor via parceria OEM de radar ou design 60 GHz próprio em invólucro certificado; molhado em 316L ou Hastelloy C-276; entity parameters IS.
- **Proteção**: 1º alvo Class I Div 2 / Zone 2 non-incendive; depois IS UL 913; NRTL = UL/FM; **US$ 10k–100k+, 4–9 meses**.
- **Firmware**: Zephyr/NCS + módulos Rust; FOTA assinado.
- **Produção**: MacroFab (TX) ou PCBWay-US; módulos pré-certificados até ~10k un./ano.
- **Custo recorrente**: LTE-M $1–3/mês + Skylo $4–6/mês só onde não há celular — média de frota < $5/dispositivo/mês.

---

## Pontos em aberto / mudanças recentes a monitorar
1. ⚠ **Skylo**: serviço vivo (16 M devices), mas constelação em consolidação (EchoStar→Starlink; Ligado→AST; Viasat/Space42 como base). Contrato via Monogoto/Soracom reduz lock-in.
2. ⚠ **Twilio IoT não existe mais** (KORE, 2023–24). Migre para Monogoto/Hologram/Soracom ou carrier direto.
3. ⚠ **STM32 lead times ~52 semanas** em L4 (estoque de distribuidor ok). Motivo adicional para nRF9151/RAK3172.
4. ⚠ **Hubble Network** GA há poucos meses (set/2026): valide tamanho de mensagem/latência antes de desenhar em volta; preço ($1–2/mês) e BOM (<$0,50) irresistíveis para backup.
5. Banner LTF = laser, não radar; Sensopart não faz radar level.
6. Preços de sensor industrial variam 2–3× entre list e street (VEGAPULS 64: list $4,3k vs surplus $780–1.900).

## Fontes principais
- Nordic: [nRF9151 DK (Digi-Key)](https://www.digikey.com/en/products/detail/nordic-semiconductor-asa/NRF9151-DK/24420446) · [nRF9151 Product Spec](https://www.mouser.lt/pdfDocs/nRF9151_PS.pdf) · [Nordic + Skylo](https://www.skylo.tech/newsroom/nordic-semiconductor-and-skylo-partner-to-bring-ultra-low-power-satellite-connectivity-to-massive-iot) · [nRF9151-LACA Newark](https://www.newark.com/nordic-semiconductor/nrf9151-laca-r/system-in-package-low-power/dp/14AM7786) · [Qoitech PSM nRF9151](https://www.qoitech.com/blog/performance-of-lte-power-save-modes-on-nordics-nrf9151-dk) · [DevZone PSM 2,7 µA](https://devzone.nordicsemi.com/f/nordic-q-a/127308/guidance-on-using-psm-vs-complete-power-off-for-ultra-low-power-iot-application-nrf9151)
- MCU: [STM32L432KC Mouser](https://www.mouser.com/c/semiconductors/embedded-processors-controllers/microcontrollers-mcu/arm-microcontrollers-mcu/?series=STM32L432KC) · [STM32U0 (ST)](https://blog.st.com/stm32u0) · [BGM240 Digi-Key](https://www.digikey.com/en/products/detail/silicon-labs/BGM240PB32VNN3/16676429) · [RAK3172 Digi-Key](https://www.digikey.com/en/products/detail/rakwireless-technology-limited/RAK3172-9-SM-NI/17138034) · [LoRa-E5 Digi-Key](https://www.digikey.com/en/product-highlight/s/seeed/lora-e5-series)
- Sensores: [VEGAPULS 62](https://www.vega.com/en-us/products/product-catalog/level/radar/vegapuls-62) · [Flowline/AutomationDirect radar](https://www.automationdirect.com/adc/shopping/catalog/sensors_-z-_encoders/level_sensors_-a-_controllers/radar_level_sensors) · [APG PT-500](https://apgsensors.com/product/submersible-pressure-transducer) · [MaxBotix MB7360 Digi-Key](https://www.digikey.com/en/products/detail/maxbotix-inc/MB7360-201/5046642) · [E+H interface](https://endressprocessautomation.com/understanding-interface-level-measurement-in-oil-gas-industry) · [Drexelbrook interface](https://www.drexelbrook.com/learningzone/application-notes/additional-opportunities/liquid-interface-measurement)
- Conectividade: [Verizon IoT $1,10](https://www.verizon.com/business/products/internet-of-things/iot-networks) · [Hologram docs](https://docs.hologram.io/guides/sims/what-are-typical-data-transmission-speeds) · [KORE/Twilio](https://www.korewireless.com/lp/20-million-sims) · [Monogoto NTN pricing](https://monogoto.io/monogoto-ntn-pricing-pay-as-you-go-simplified-pricing) · [nRF9151+Skylo guide](https://docs.monogoto.io/ntn-satellite-networks/ntn-certified-devices/ntn-certified-modules/nordic-nrf9151-satellite-ntn-network) · [Skylo cert](https://www.skylo.tech/skylo-certification-program) · [TTN US](https://www.thethingsnetwork.org/country/usa) · [LoRa Alliance O&G](https://lora-alliance.org/wp-content/uploads/2021/04/LoRaWAN-OIl-Gas.pdf) · [Iridium 9603](https://www.sparkfun.com/products/18788) · [ORBCOMM OGX](https://www.orbcomm.com/newsroom/orbcomm-launches-first-native-satellite-tracker-for-advanced-ogx-network)
- Hazloc/regulatório: [OSHA 1910.307](http://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.307) · [UL hazardous areas](https://www.ul.com/services/ul-and-c-ul-hazardous-areas-certification-north-america) · [IS store 2025 guide](https://intrinsicallysafestore.com/blog/intrinsically-safe-regulations-usa-2025) · [IECEx custo](https://certifypowerhouse.odoo.com/blog/our-blog-1/how-much-does-iecex-certification-cost-18) · [FCC KDB 996369/modules](https://www.emcfastpass.com/fcc-rules-for-kits-and-subassemblies/) · [Rolled Alloys H2S/NACE](https://www.rolledalloys.com/articles/hydrogen-sulfide-nace-mr0175-iso-15156-nace-mr0103) · [H2S pitting 316L (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8276138)
- Energia/manufatura/firmware: [Tadiran TL-5930/S](https://megabatteries.com/12-pack-tadiran-tl-5930-s-3-6v-d-19-ah-lithium-batteries-lsh20-ls33600/) · [Voltaic 2W](https://www.voltaicsystems.com/2watt.shtml) · [MacroFab](https://www.macrofab.com/platform) · [low-volume benchmarks](https://buildamtech.com/low-volume-pcb-assembly) · [Golioth Rust nRF9160](https://blog.golioth.io/embedded-rust-with-golioth-and-the-nordic-nrf9160) · [Zephyr Rust 2026](https://www.zephyrproject.org/event/embedded-development-with-rust-on-zephyr) · [State of embedded Rust mid-2026](https://derekmolloy.ie/the-state-of-rust-for-embedded-development-in-mid-2026) · [GNAT Pro](https://www.adacore.com/gnatpro) · [GNAT bareboard](https://docs.adacore.com/gnat_ugx-docs/html/gnat_ugx/gnat_ugx/bareboard_topics.html)

*(Preços capturados em 02–03/nov/2026; revalide no checkout.)*
