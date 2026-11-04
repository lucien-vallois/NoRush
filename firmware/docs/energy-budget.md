# Orçamento de Energia das Boias

**Fonte de verdade**: `firmware/src/app/energy_mgr.ads` + `.adb`
**Valores fixados por teste**: `firmware/tests/test_energy.adb`

Este documento existe porque o doc de hardware v1.2 afirmava *"autonomia de
30-45 dias"* sem que a aritmética fechasse. Com o modelo executável abaixo,
qualquer mudança em tempo de TX, corrente de sleep ou período faz os testes
falharem — e este bloco precisa ser atualizado junto.

---

## 1. Modelo

Tudo em **inteiros**, sem ponto-flutuante:

| Grandeza | Unidade | Observação |
|---|---|---|
| tempo | `ms` | |
| corrente | `uA` | 1 mA = 1000 uA |
| energia | `uA * ms` | produto direto |
| capacidade | `mAh` | 1 mAh = 3,6 × 10⁹ `uA*ms` |

### Fórmulas

```txt
Active_Ms   = Wake_Ms + Tx_Ms + Rx_Ms

Cycle_Energy = Wake_Ms * Wake_Ua
             + Tx_Ms   * Tx_Ua
             + Rx_Ms   * Rx_Ua
             + (Period_Ms - Active_Ms) * Sleep_Ua        [uA*ms]

Cycles_Per_Day = Ms_Per_Day / Period_Ms                  (86.400.000 / Period_Ms)
Daily          = Cycles_Per_Day * Cycle_Energy           [uA*ms]
Average_Ua     = Daily / Ms_Per_Day                      [uA]

Capacity       = Capacity_Mah * 3,6e9 * Usable_Fraction / 100   [uA*ms]
Autonomy_Days  = Capacity / Daily
```

`Usable_Fraction` é a fração da capacidade nominal **realmente extraível**
(corte de desligamento, envelhecimento). Adotado **80 %**.

A subtração `Period_Ms - Active_Ms` é válida porque os perfis satisfazem
`Active_Ms <= Period_Ms` (verificado por teste).

---

## 2. Perfis

### Boia A — `Energy_Mgr.Boia_A_Profile`

| Fase | Tempo | Corrente | Energia |
|---|---|---|---|
| Acordar + leitura do magnetostrutivo + processar | 25 ms | 25 mA | 625.000 uA·ms |
| TX LoRa 12 bytes, SF9BW125, +14 dBm | 270 ms | 45 mA | 12.150.000 uA·ms |
| Janelas RX1/RX2 (classe A) | 540 ms | 5,5 mA | 2.970.000 uA·ms |
| Sleep (STOP2 + SX1262 sleep) | 59.165 ms | 20 uA | 1.183.300 uA·ms |
| **Total por ciclo (60 s)** | **835 ms ativos** | | **16.928.300 uA·ms** |

### Boia B — `Energy_Mgr.Boia_B_Profile`

| Fase | Tempo | Corrente | Energia |
|---|---|---|---|
| Acordar + condutividade + posição + processar | 30 ms | 12 mA | 360.000 uA·ms |
| TX LoRa 12 bytes, SF8BW125, +10 dBm | 160 ms | 30 mA | 4.800.000 uA·ms |
| Janelas RX1/RX2 (classe A) | 430 ms | 5,5 mA | 2.365.000 uA·ms |
| Sleep (STOP + SX1262 sleep) | 59.380 ms | 15 uA | 890.700 uA·ms |
| **Total por ciclo (60 s)** | **620 ms ativos** | | **8.415.700 uA·ms** |

---

## 3. Resultados

| Métrica | Boia A | Boia B |
|---|---|---|
| Energia por ciclo | 16.928.300 uA·ms (0,0047 mAh) | 8.415.700 uA·ms (0,0023 mAh) |
| Corrente média | **282 uA** | **140 uA** |
| Consumo diário | 6,77 mAh/dia | 3,36 mAh/dia |
| Sleep contínuo (24 h) | 0,48 mAh/dia | 0,36 mAh/dia |
| Bateria | 2600 mAh | 1000 mAh |
| **Autonomia (80 % utilizável)** | **307 dias (~10,1 meses)** | **237 dias (~7,8 meses)** |
| Autonomia (100 % nominal) | 383 dias (~12,6 meses) | 297 dias (~9,8 meses) |
| Autonomia em SF12 (80 %) | 72 dias (~2,4 meses) | 41 dias (~1,4 meses) |
| Com painel solar | indefinida em regime | indefinida em regime |

---

## 4. Reconciliação com o doc v1.2

A versão anterior declarava:

| Afirmado em v1.2 | Real (calculado) | Origem do erro |
|---|---|---|
| "Ativo: 45 mA" | 25 + 45 + 5,5 mA por fase | media era ambígua |
| "Sleep: 0,5 mA" | **20 uA** (A) / **15 uA** (B) | 0,5 mA é ~25x o consumo real de STOP2 + SX1262 em sleep |
| "Autonomia: 30-45 dias" | **307 dias** (A) / **237 dias** (B) | consequência do sleep errado |
| "Bateria 1000 mAh" (A) | **2600 mAh** | 1000 mAh não alimenta 3,5 dm³ de boia com o rádio |

### Por que 0,5 mA de sleep destruía o orçamento

Com piso de 0,5 mA, a bateria dura no máximo

```txt
1000 mAh / 0,5 mA = 2000 h = 83 dias
```

**sem nem acordar uma vez.** Qualquer duty cycle sobre esse piso reduz a
autonomia abaixo disso — daí os "30-45 dias" do doc, que ainda assim não
batiam com 1 leitura/min. O consumo real de sleep (20 uA) é o que torna os
10 meses possíveis.

---

## 5. Como verificar

```powershell
powershell -ExecutionPolicy Bypass -File firmware\scripts\check.ps1
```

Os valores da tabela da seção 3 estão **fixados como igualdades exatas** em
`tests/test_energy.adb`:

```ada
Check_Eq_N (Autonomy_Days (A, 2600, 80), 307, "autonomia Boia A = 307 dias");
Check_Eq_N (Autonomy_Days (B, 1000, 80), 237, "autonomia Boia B = 237 dias");
Check_Eq_N (Average_Current (A), 282, "corrente media A = 282 uA");
```

Se algum parâmetro de consumo mudar, esses testes falham e este documento
precisa ser atualizado junto.

---

## 6. Limitações do modelo

1. **Não modela degradação por temperatura.** LiPo abaixo de 0 °C perde
   capacidade relevante; a faixa operacional declarada é -10 °C a 60 °C e
   o corte de -10 °C vale para a célula, não apenas para a eletrônica.
2. **Não modela retransmissão LoRaWAN.** Cada retentativa adiciona um ciclo
   de TX+RX completo. Em campo com PER de 5 %, some ~5 % na autonomia.
3. **Não modela join LoRaWAN.** O join consome vários ciclos de TX/RX; se o
   nó perder a junção e religar, isso aparece como queda de autonomia.
4. **Corrente de RX fixa em 5,5 mA.** O SX1262 em RX contínuo chega a ~5,5 mA;
   o STM32 deve estar em STOP durante as janelas — se ficar em RUN, some
   ~2-3 mA e a autonomia cai ~20 %.
5. **`Active_Ms <= Period_Ms`** é pressuposto. Se o duty cycle for reduzido
   para menos de ~2 s de período, o modelo invalida o perfil.

---

*Documento gerado a partir da implementação em `energy_mgr`.*
