# Firmware das Boias A e B

> **Status (2026-11-04): R&D em standby — pesquisa futura.** Este material trata do hardware próprio (cabeça/boias NoRush), pausado até o piloto provar valor. O escopo atual usa uma haste magnetostritiva comercial certificada, com o NoRush como camada de software: ver [Plano D](../docs/plano-d-desenvolvimento.md).

Firmware embarcado das boias inteligentes de medição de nível, em
**Ada 2012 / SPARK** (lógica) + **C** (drivers de hardware).

- **Boia A** — nível do óleo. STM32L432KC (ARM Cortex-M4F) + SX1262 + sensor
  magnetostrutivo.
- **Boia B** — interface água/óleo. STM32L072KB (ARM Cortex-M0+) + SX1262 +
  sensor magnetostrutivo + célula de condutividade.

As especificações de hardware estão em `docs/componentes/`.

---

## 1. Como rodar

```powershell
powershell -ExecutionPolicy Bypass -File firmware\scripts\check.ps1
```

Isso faz **tudo**: compila a lógica Ada, roda os 115 checks, compila os
drivers C com `-Wall -Wextra -Werror -Wpedantic` e roda os 30 checks deles.
Exit code 0 = tudo verde.

Manualmente:

```powershell
gprbuild -P firmware\gnat\boias.gpr
firmware\build\host\test_main.exe
```

---

## 2. Estrutura

```txt
firmware/
  gnat/
    boias.gpr              build HOST (simulador) - GNAT nativo
    boias_target.gpr       build ALVO ARM - requer Alire + gnat_arm_elf
  src/
    app/                   logica pura, SPARK_Mode => On
      payload_codec        codificacao binaria do uplink (fonte de verdade)
      arqueacao            nivel -> volume (tabela monotônica + interpolacao)
      alert_engine         limiar + histerese + cooldown
      calibration          offset + ganho, serializacao com CRC
      interface_detector   deteccao de interface (Boia B)
      energy_mgr           modelo de consumo e autonomia
      device_state         montagem do frame de telemetria
    hal/                   interfaces com o hardware (contratos)
      hal_types            tipos de dominio, faixas explicitas
      hal_clock, hal_power, hal_sensor, hal_radio, hal_storage
    bsp/
      sim/                 corpos simulados para o build host
        sim_control        estado injetavel pelos testes
      stm32l4/             corpos de alvo (Boia A)  -> nao compilados no host
      stm32l0/             corpos de alvo (Boia B)  -> nao compilados no host
  c/
    sx1262/                driver do radio LoRa (registradores)
    mag_sensor/            encodador magnetostrutivo (Modbus RTU/RS485)
  tests/
    test_harness           mini-harness (AUnit nao esta instalado)
    test_payload           vetores de ouro + regras de rejeicao
    test_arqueacao         interpolacao, saturacao, monotonicidade
    test_interface         estabilidade, condutividade, limiares
    test_energy            autonomia contra os valores dos docs
    test_alerts            histerese, cooldown, anti-oscilacao
    test_calibration       round-trip, CRC, faixas
    c/test_c_drivers       drivers C contra plataformas falsas
  docs/
    payload.md             especificacao do frame de uplink
    energy-budget.md       derivacao do orcamento de energia
  scripts/check.ps1        build + todos os testes
```

---

## 3. Arquitetura

```txt
                 ┌─────────────────────────────────────┐
                 │  src/app  (SPARK_Mode => ON)        │
                 │  logica pura, verificavel, sem HW   │
                 └──────────────┬──────────────────────┘
                                │ usa tipos de
                 ┌──────────────▼──────────────────────┐
                 │  src/hal  (SPARK_Mode => OFF)       │
                 │  boundary de confianca              │
                 └──────────────┬──────────────────────┘
                                │ corpo selecionado pelo GPR
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
  bsp/sim/                bsp/stm32l4/            bsp/stm32l0/
  (host, testes)          (Boia A, alvo)          (Boia B, alvo)
                                │
                                ▼
                          c/ (drivers)
```

### Por que o HAL é `SPARK_Mode => Off`

`src/hal` modela estado externo (hardware). Marcá-lo como não-SPARK é o
procedimento padrão: o GNATprove trata cada chamada a um subprograma não-SPARK
de forma **conservadora**, assumindo que o resultado é qualquer valor dentro do
subtipo declarado. Assim a lógica em `src/app` **continua completamente
verificável**, com os valores vindos do hardware tratados como arbitrários
(though limitados pelas faixas declaradas).

Isso também define a fronteira de revisão de segurança: tudo que precisa ser
auditado manualmente está em `src/hal` e `src/bsp`.

### Por que o build host usa os mesmos fontes

`boias.gpr` aponta `Source_Dirs` para `src/bsp/sim`; `boias_target.gpr` aponta
para `src/bsp/stm32l4`. O código de aplicação é **idêntico** nos dois builds —
só o corpo do HAL muda. É assim que a lógica testada no host é a mesma que roda
no alvo.

---

## 4. O que está verificado hoje

| Camada | Como | Status |
|---|---|---|
| Lógica Ada (`src/app`) | 115 checks, assertions `-gnata`, validity `-gnatVa` | **verificado** |
| Contratos SPARK | escritos em todos os pacotes de `src/app` | **escritos, não executados** |
| Prova formal (`gnatprove`) | — | **não executada** (toolchain ausente) |
| Drivers C (`c/`) | 30 checks, `-Wall -Wextra -Werror -Wpedantic` | **verificado** |
| Bindings de alvo (`src/bsp/stm32l4`, `stm32l0`) | — | **não compilados** (sem cross toolchain) |
| Teste em hardware | — | **não feito** |

### Habilitando a prova formal

```powershell
alr get gnatprove
alr toolchain --select gnatprove
```

`scripts/check.ps1` detecta o `gnatprove` e roda `--mode=check` automaticamente.

### Habilitando o build de alvo

```powershell
alr get boias_firmware
alr toolchain --select gnat_arm_elf
gprbuild -P firmware/gnat/boias_target.gpr
```

O runtime `light` (sem heap) é obrigatório para o STM32L072, que tem apenas
20 KB de RAM — ver `docs/componentes/boia-b-interface.md`.

---

## 5. Decisões que valem revisão

| Decisão | Alternativa | Por que esta |
|---|---|---|
| Frame binário de 12 bytes | JSON | JSON não cabe nos 19 bytes de DR0 do LoRaWAN |
| RSSI codificado como `dbm + 129` | i8 com sentinela | sem ambiguidade entre "0 dBm" e "desconhecido" |
| Ganho de calibração 500..1500 | livre | limita o dano de uma calibração errada |
| `Clears ==> not Triggers` | histerese livre | propriedade formal que impede alert storm |
| Interpolação em `Long_Long_Integer` | `Integer` | `delta_v * delta_l` estoura 32 bits em tabelas grandes |
| Perfis de energia como código | tabela em planilha | testável; mudança de consumo quebra o teste |
| `Energy_Mgr` separado de `Device_State` | um só | consumo é propriedade do rádio/HW, não do estado do nó |

---

## 6. Adicionando um BSP

1. Crie `src/bsp/<plataforma>/` com os **corpos** de `hal_clock`,
   `hal_power`, `hal_sensor`, `hal_radio` e `hal_storage` (os `.ads` ficam
   em `src/hal`, não mexa).
2. Aponte `Source_Dirs` do projeto para a nova pasta.
3. Se a plataforma tiver drivers em C, coloque-os em `c/` e importe com
   `Import => True, Convention => C`.
4. Rode `scripts/check.ps1` — a lógica em `src/app` não deve precisar de
   nenhuma mudança. Se precisar, a abstração está errada.
