# Contrato de integração de hardware (boias → plataforma)

Este documento define o contrato que o firmware das boias deve cumprir para
enviar telemetria à plataforma NoRush. É a referência única para o
desenvolvimento do hardware: identidade, autenticação, transporte, formato
de mensagens e sequência de bring-up. A versão de referência está em
inglês: [Hardware integration contract](hardware-integration.md).

**URL base da API.** Os caminhos abaixo são relativos à base da API:
`http://localhost:3000` numa instalação local, ou `https://norush.example.com/api`
atrás do proxy reverso da [instalação em produção](production-install.md).

> **Equipamento comercial com gateway Modbus** (por exemplo, a haste de duas boias com gateway do fabricante) não precisa implementar este contrato: o adaptador [`norush-edge`](../edge/README.md) lê o gateway no pad e fala este contrato pelo equipamento.

> **Escopo:** protótipo de engenharia. O contrato cobre autenticação por
> dispositivo com secret + TLS. Certificados individuais (mTLS), ACLs no
> broker e provisionamento industrial são evoluções futuras registradas no
> README, não parte deste contrato.

---

## 1. Modelo de identidade

| Conceito | Onde vive | Exemplo |
| --- | --- | --- |
| **Dispositivo** | Registro `sensors` (campo `sensorId`) | `SENSOR-101` |
| **Credencial** | sha256 do secret, colunas `credentialHash/credentialVersion` | — |
| **Secret** | Exibido uma única vez no provisionamento | `nrk_A1b2...` (47 chars) |

- O `sensorId` é a identidade pública do dispositivo nas mensagens e nos
  tópicos MQTT. Pode ser o serial do fabricante (regra: `^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`).
- O secret **nunca** é persistido em claro: o banco guarda apenas o sha256.
- A cada rotação, `credentialVersion` incrementa; o secret antigo deixa de
  funcionar imediatamente.

## 2. Provisionamento (operador, antes da instalação)

Com um token JWT de usuário `admin`:

```powershell
# Criar dispositivo novo (tankId obrigatório) ou reprovisionar existente
curl -X POST http://localhost:3000/devices `
  -H "Authorization: Bearer <admin-jwt>" -H "Content-Type: application/json" `
  -d '{ "sensorId": "SENSOR-101", "tankId": "<uuid-do-tanque>", "model": "NRK-B1", "firmwareVersion": "0.9.0" }'

# Rotacionar credencial
curl -X POST http://localhost:3000/devices/SENSOR-101/credentials -H "Authorization: Bearer <admin-jwt>"

# Revogar (dispositivo perdido/retirado)
curl -X DELETE http://localhost:3000/devices/SENSOR-101/credentials -H "Authorization: Bearer <admin-jwt>"
```

A resposta de provisionamento/rotação devolve o **secret uma única vez**:

```json
{ "sensorId": "SENSOR-101", "secret": "nrk_...", "credentialVersion": 1, "issuedAt": "..." }
```

Grave o secret na configuração do firmware (por exemplo, armazenamento
protegido do MCU ou during provisioning over USB). Ele não pode ser
recuperado depois — apenas rotacionado.

## 3. Autenticação da ingestão (`IOT_AUTH_MODE`)

| Modo | Comportamento | Uso |
| --- | --- | --- |
| `shared` (padrão) | Exige `IOT_INGEST_KEY` compartilhada no campo `authToken` | Demonstração e simulador |
| `device` | Exige a credencial individual do dispositivo; sem fallback | **Operação com hardware real** |
| `hybrid` | Aceita credencial individual OU chave compartilhada | Transição/mixed fleet |

A credencial viaja em um destes lugares (o header tem precedência):

- **MQTT:** campo `authToken` do payload JSON (TLS protege o canal).
- **HTTP:** header `X-Device-Token: nrk_...` (preferível; não aparece em
  logs de corpo) ou campo `authToken` do payload.

Recusas retornam os códigos `invalidDeviceCredential` (secret errado) ou
`deviceNotProvisioned` (sem credencial emitida) — no HTTP como resposta
traduzida; no MQTT a mensagem é descartada e o motivo aparece no log do
gateway.

## 4. Transporte

### 4.1 MQTT (preferencial)

| Item | Valor |
| --- | --- |
| Broker | `MQTT_HOST:MQTT_PORT` (padrão `localhost:1883`; **8883 + `mqtts`** com TLS) |
| QoS | 1 (at least once) — publique com QoS 1 e trate duplicatas como idempotentes |
| Keep-alive | 60 s |
| Client ID | Único por dispositivo (ex.: `dev-SENSOR-101`); sessões limpas |

**Tópicos por dispositivo** (o contrato novo; binding tópico↔sensorId é
validado — publicar como outro dispositivo é descartado):

| Direção | Tópico | Uso |
| --- | --- | --- |
| Boia → plataforma | `devices/{sensorId}/telemetry` | Leitura de nível (seção 5) |
| Boia → plataforma | `devices/{sensorId}/status` | Heartbeat (seção 6) |
| Plataforma → boia | `devices/{sensorId}/commands` | Comandos (seção 7) |
| Boia → plataforma | `devices/{sensorId}/commands/responses` | Resposta de comando |

O tópico legado `sensors/data` continua aceito para a demonstração
(chave compartilhada), mas o firmware novo deve usar `devices/...`.

### 4.2 HTTP (alternativa / backfill)

| Endpoint | Uso |
| --- | --- |
| `POST /iot/sensors/data` | Telemetria individual |
| `POST /iot/sensors/batch` | Até 100 mensagens (backfill de armazenamento limitado) |
| `POST /iot/sensors/heartbeat` | Sinal de vida sem leitura |

Todos aceitam `X-Device-Token`. Para LTE-M/NB-IoT ou satélite com IP,
HTTP+TLS costuma ser mais simples que MQTT; para LoRaWAN, publique via
bridge no formato HTTP acima (payload JSON no body).

## 5. Mensagem de telemetria

```json
{
  "sensorId": "SENSOR-101",
  "authToken": "nrk_...",
  "level": 3.452,
  "oilWaterInterface": {
    "oilLevel": 1.1,
    "waterLevel": 2.352,
    "interfaceLevel": 2.352
  },
  "batteryLevel": 87.5,
  "timestamp": "2026-11-02T14:03:17Z",
  "version": "0.9.0",
  "metadata": { "signalStrength": -72, "temperature": 21.4 }
}
```

Regras validadas pelo gateway (rejeitadas **antes** de gravar/emitir):

- `level`: número ≥ 0, em **metros**, dentro da faixa do sensor e da altura
  física do tanque.
- `oilWaterInterface` (haste de duas boias): `oilLevel` e `waterLevel` são as
  **espessuras** das camadas e somam `level` (tolerância 1 mm);
  `interfaceLevel` é a **altura da interface medida do fundo**, entre 0 e
  `level`. Na haste de duas boias ela é igual a `waterLevel`. Tanque com mais
  água que óleo, o normal em flowback, é válido.
- `batteryLevel`: 0–100.
- `timestamp`: ISO 8601 UTC; não mais que 30 s no futuro. Omitir = horário
  de recepção.
- `sensorId` deve corresponder ao tópico (MQTT) e a um sensor **ativo**.

Resposta HTTP de sucesso: `{ "processed": true, "requestId": "..." }`;
falha de validação: `processed: false` + `errors[]` (não retente o mesmo
payload — corrija a causa).

## 6. Heartbeat (`devices/{sensorId}/status` ou `POST /iot/sensors/heartbeat`)

Sinal de vida entre intervalos de medição; não cria leitura:

```json
{ "sensorId": "SENSOR-101", "authToken": "nrk_...", "batteryLevel": 87.5, "firmwareVersion": "0.9.0", "signalStrength": -72 }
```

Atualiza `lastTransmissionAt` (o console considera o dispositivo online por
5 min), bateria, firmware e sinal. Recomendado: 1 heartbeat para cada 3–4
ciclos de medição, ou após eventos (boot, reconexão, erro de sensor).

## 7. Comandos (plataforma → boia)

Publicados em `devices/{sensorId}/commands`; a boia responde em
`devices/{sensorId}/commands/responses`:

```json
{ "command": "DIAGNOSTIC", "requestId": "req_...", "parameters": {}, "timestamp": "..." }
```

Comandos definidos: `CALIBRATE`, `RESET`, `UPDATE_CONFIG`, `DIAGNOSTIC`,
`SHUTDOWN`. Assine o tópico de comandos com QoS 1 e responda com
`{ "requestId": "...", "status": "SUCCESS" | "FAILED", "data": {} }`.

## 8. Energia e frequência (orientação de projeto)

- Intervalo de medição sugerido: 15 min (feed do motor de ETA e dos
  agregados de 5 min/1 h).
- Envie telemetria imediatamente após medir; agrupe em `batch` se o rádio
  custar mais que a medição (ex.: satélite).
- Device sleep entre ciclos: desligue o sensor e o rádio; o heartbeat
  existe justamente para manter o estado "online" com mínimo consumo.
- `batteryLevel` abaixo de 20% reduz o indicador de qualidade da leitura e
  dispara alerta de bateria no processamento agendado.

## 9. Sequência de bring-up (primeira boia física)

1. `npm run infra:up && npm run seed` — plataforma de pé com tanques demo.
2. Defina `IOT_AUTH_MODE=device` no `.env` e reinicie o backend.
3. Provisione o dispositivo (`POST /devices`) com o `tankId` real.
4. Configure o firmware: `sensorId`, secret, broker/TLS (ou URL HTTP).
5. Publique um heartbeat e confira o console (Sensors → online).
6. Publique telemetria com nível plausível e confira Dashboard + History.
7. Force um erro (level fora da faixa) e confirme a rejeição em
   `docs/validation` / log do gateway.

## 10. Estado de segurança desta entrega

Pronto: credencial por dispositivo (sha256 + comparação em tempo constante),
rotação/revogação, binding de tópico, rejeição antes de persistência, TLS
MQTT/HTTPS suportados, rate limiting e OpenAPI.

Fora do escopo (registre ao evoluir): mTLS/certificado por dispositivo,
ACLs por tópico no broker, OTA assinado, IDS e provisionamento zero-touch.
