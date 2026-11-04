# Payload de Uplink — Frame Binário LoRaWAN

**Fonte de verdade**: `firmware/src/app/payload_codec.ads` + `.adb`
**Vetores de ouro**: `firmware/tests/test_payload.adb`

Qualquer reimplementação (Python no gateway, C no backend) **deve** reproduzir
exatamente os vetores de ouro abaixo. Se não reproduzir, está errada.

---

## 1. Por que binário

| Formato | Tamanho típico | Cabe em DR0 (19 bytes)? |
|---|---|---|
| JSON (`{"device_id":...,"position":...}`) | ~180 bytes | **não** |
| Frame binário deste documento | **12 bytes** | sim |

O payload de aplicação do LoRaWAN em **DR0 (SF10BW125)** é limitado a **19
bytes**. Em US915/BR915, DR0 é o data rate mínimo e o único disponível em
qualquer distância — um formato que não cabe em DR0 não é utilizável em campo.

---

## 2. Layout do frame (12 bytes, big-endian)

```txt
Offset  Campo           Tam  Tipo    Range / Unidade
------  --------------  ---  ------  -----------------------------
  0     device_id        2   u16     0..65535, big-endian
  2     seq              1   u8      contador de uplink (wrap 255->0)
  3     flags            1   bitset  b0 = calib_valid
                                     b1 = alerta ativo
                                     b2 = bateria baixa
                                     b3 = interface_ok (Boia B)
                                     b4..7 = reservados, IGNORADOS
  4     position_mm      2   u16     0..5000, big-endian
  6     temp_ddegc       2   i16     -100..600, complemento de dois,
                                     big-endian (0,1 °C)
  8     battery_pct      1   u8      0..100
  9     rssi_enc         1   u8      0 = desconhecido
                                     1..129 = rssi_dbm + 129
 10     confidence       1   u8      0..100 (100 = não aplicável)
 11     crc8             1   u8      CRC-8/ATM, poly 0x07, init 0x00
------  --------------  ---  ------  -----------------------------
TOTAL                    12 bytes   (limite DR0 = 19 bytes)
```

### Detalhes de codificação

- **`device_id` / `position_mm`**: inteiros sem sinal, **big-endian** (byte
  mais significativo primeiro).
- **`temp_ddegc`**: **complemento de dois de 16 bits**, big-endian.
  Ex.: `-100` → `0xFF 0x9C`; `285` → `0x01 0x1D`.
- **`rssi_enc`**: `0` significa "desconhecido". Caso contrário o valor
  armazenado é `rssi_dbm + 129`, produzindo `1..129` para `-128..0`.
  Valores `130..255` são **inválidos** e fazem o frame ser descartado.
- **`flags` bits 4..7**: reservados. Um decodificador **deve ignorá-los**
  (não deve rejeitar o frame por causa deles) para permitir extensão futura.
- **`crc8`**: CRC-8/ATM — polinômio `0x07`, `init 0x00`, sem reflexão, sem
  `xorout`. Calculado sobre os **11 primeiros bytes** (`0..10`).

> O LoRaWAN já aplica CRC-16 na PHY. O CRC-8 de aplicação cobre apenas erro
> de codificação/decodificação do frame, não erro de rádio.

---

## 3. Vetores de ouro

Saída real de `Payload_Codec.Encode`. Fixada por teste.

### Boia A

`device_id=1, seq=42, calib_valid, posição=2340 mm, temp=28,5 °C,
bateria=85 %, RSSI=-78 dBm, confidence=100`

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

### Boia B

`device_id=2, seq=23, calib_valid + interface_ok, interface=1850 mm,
temp=26,8 °C, bateria=78 %, RSSI=-82 dBm, confidence=95`

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

---

## 4. Regras de rejeição

O decodificador devolve "frame inválido" (e descarta) quando:

| # | Condição | Exemplo |
|---|---|---|
| 1 | `length != 12` | 11 ou 13 bytes |
| 2 | CRC não fecha | qualquer byte corrompido |
| 3 | `position_mm > 5000` | `0x1389` = 5001 |
| 4 | `battery_pct > 100` | `200` |
| 5 | `confidence > 100` | `200` |
| 6 | `temp_ddegc` fora de `-100..600` | `-30,0 °C` |
| 7 | `rssi_enc > 129` | `200` |

Observações:
- Bits reservados de `flags` **não** causam rejeição.
- `device_id` e `seq` são modulares, sempre válidos.

---

## 5. fPorts

| fPort | Conteúdo | Frequência |
|---|---|---|
| 1 | Telemetria (frame acima) | 1 leitura/min |
| 2 | Identificação do dispositivo (fw version, modelo, calibração resumida) | a cada 24 h ou sob demanda |

O frame de telemetria **não** carrega `firmware_version`. Esse dado viaja no
fPort 2, que é uplink dedicado e pouco frequente.

---

## 6. Decodificador de referência (Python)

```python
FRAME_SIZE = 12

def crc8(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 0x80:
                crc = ((crc & 0x7F) << 1) ^ 0x07
            else:
                crc = (crc & 0x7F) << 1
            crc &= 0xFF
    return crc


def decode(raw: bytes):
    if len(raw) != FRAME_SIZE:
        return None
    if crc8(raw[:11]) != raw[11]:
        return None

    device_id = (raw[0] << 8) | raw[1]
    seq       = raw[2]
    flags     = raw[3]
    position  = (raw[4] << 8) | raw[5]

    t = (raw[6] << 8) | raw[7]
    temp = t - 65536 if t >= 32768 else t

    battery = raw[8]

    enc = raw[9]
    if enc == 0:
        rssi = None
    elif enc <= 129:
        rssi = enc - 129
    else:
        return None

    confidence = raw[10]

    if position > 5000 or battery > 100 or confidence > 100:
        return None
    if not (-100 <= temp <= 600):
        return None

    return {
        "device_id": device_id,
        "seq": seq,
        "flags": {
            "calib_valid":  bool(flags & 0x01),
            "alert_active": bool(flags & 0x02),
            "battery_low":  bool(flags & 0x04),
            "interface_ok": bool(flags & 0x08),
        },
        "position_mm": position,
        "temp_ddegc":  temp,
        "battery_pct": battery,
        "rssi_dbm":    rssi,
        "confidence":  confidence,
    }
```

Verificação: `decode(bytes.fromhex("00012A010924011D553364 0D".replace(" ", "")))`
deve devolver posição `2340`, temperatura `285`, bateria `85`, RSSI `-78`.

---

## 7. Consequências para o gateway/backend

1. **Decodificar é obrigatório antes de qualquer processamento.** Um frame
   inválido deve ser contado (métrica) e descartado, nunca armazenado.
2. **`position_mm` → volume** usa a tabela de arqueação do tanque
   (`firmware/src/app/arqueacao` é a referência de interpolação).
3. **`seq`** permite detectar perda de pacotes: incremento diferente de +1
   (módulo 256) indica lacuna.
4. **`rssi_dbm = null`** é válido e comum — o nó não mede o próprio sinal.
   O gateway deve preencher com o RSSI real da recepção.
5. **`confidence = 100`** significa "não aplicável" (Boia A). A Boia B usa
   a faixa 0..100 de verdade.

---

*Documento gerado a partir da implementação em `payload_codec`. Se a
implementação mudar, este documento e os testes mudam juntos.*
