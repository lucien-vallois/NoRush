# BSPs — corpos do HAL por plataforma

O GPR seleciona **qual corpo** de `hal_clock`, `hal_power`, `hal_sensor`,
`hal_radio` e `hal_storage` é compilado, apenas trocando o `Source_Dir`.
Os `.ads` ficam todos em `src/hal` e **não mudam** entre plataformas.

| Pasta | Plataforma | Compilado por | Status |
|---|---|---|---|
| `sim/` | host (testes) | `gnat/boias.gpr` | completo, testado |
| `stm32l4/` | Boia A — STM32L432KC | `gnat/boias_target.gpr` | **parcial** |
| `stm32l0/` | Boia B — STM32L072KB | `gnat/boias_target.gpr` | **vazio** |

---

## `sim/` — simulador de host

Corpos completos. `sim_control.ads` expõe o estado simulado (posição,
temperatura, condutividade, bateria, rádio, flash) para os testes injetarem
leituras. É assim que a lógica em `src/app` é exercida de ponta a ponta sem
hardware.

---

## `stm32l4/` — Boia A (alvo)

Contém `hal_sensor.adb`, o **exemplar** do padrão de binding: chama os
drivers C de `c/mag_sensor` e `c/sx1262` via `Import => True,
Convention => C`. É o que falta seguir para os demais corpos.

Faltam: `hal_clock.adb`, `hal_power.adb`, `hal_radio.adb`, `hal_storage.adb`.

Cada um desses é uma camada fina sobre registradores do STM32L4 ou sobre os
drivers C, e precisa do cross toolchain `arm-eabi` para ser compilado e
validado. Não escrever aqui código que não pode ser compilado é deliberado:
o que é verificável hoje (lógica + drivers) já está verificado; o resto entra
junto com a toolchain.

---

## `stm32l0/` — Boia B (alvo)

Vazio. Mesmo padrão do `stm32l4`, com as diferenças:

- Runtime Ada **`light`** (sem heap) — obrigatório, são só 20 KB de RAM.
- `hal_sensor.adb` também implementa `Read_Conductivity` e
  `Has_Conductivity_Cell` devolvendo `True` (a Boia B tem a célula).
- Clock/power em STOP (não STOP2), conforme a família STM32L0.

---

## Como adicionar um corpo

1. Crie o `.adb` com **o mesmo nome** do `.ads` em `src/hal`.
2. Nenhum `.ads` novo — os contratos já existem e são o contrato de
   interoperabilidade entre plataformas.
3. Rode `scripts/check.ps1`. O build host não deve mudar em nada; se mudar,
   o `.adb` está vazando dependência de plataforma para a lógica.
