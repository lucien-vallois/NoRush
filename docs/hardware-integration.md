# Hardware integration contract

What a device, or a gateway client acting for one, must do to send telemetry to NoRush: identity, authentication, transport, message format and the bring-up sequence. [Português](integracao-hardware.md).

> **Commercial gauges with a Modbus gateway** (for example, a dual-float gauge with the vendor's gateway) do not need to implement this contract. The [`norush-edge`](../edge/README.md) adapter reads the gateway at the pad and speaks this contract for them.

> **Scope:** engineering prototype. The contract covers per-device authentication with a secret over TLS. Per-device certificates (mTLS), broker ACLs and industrial provisioning are future work listed in the README, not part of this contract.

**API base URL.** Paths below are relative to the API base: `http://localhost:3000` on a local install, or `https://norush.example.com/api` behind the reverse proxy from [Production install](production-install.md). The examples use `$NORUSH_API` for it.

## 1. Identity

| Concept | Where it lives | Example |
| --- | --- | --- |
| **Device** | `sensors` record, `sensorId` field | `SENSOR-101` |
| **Credential** | sha256 of the secret, columns `credentialHash` / `credentialVersion` | — |
| **Secret** | Shown once, when the device is provisioned | `nrk_A1b2...` (47 characters) |

- `sensorId` is the device's public identity in messages and MQTT topics. It can be the manufacturer's serial number. Rule: `^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$`.
- The secret is **never** stored in clear text: the database keeps only its sha256.
- Each rotation increments `credentialVersion`, and the old secret stops working immediately.

## 2. Provisioning (before installation)

From the console: **Sensors → Register gauge** (admin), as described in the [user guide](user-guide.md#register-a-gauge-admin). Or through the API, with an `admin` user's JWT:

```bash
# Create a device (tankId is required) or re-provision an existing one
curl -X POST "$NORUSH_API/devices" \
  -H "Authorization: Bearer <admin-jwt>" -H "Content-Type: application/json" \
  -d '{ "sensorId": "SENSOR-101", "tankId": "<tank-uuid>", "model": "NRK-B1", "firmwareVersion": "0.9.0" }'

# Rotate the credential
curl -X POST "$NORUSH_API/devices/SENSOR-101/credentials" -H "Authorization: Bearer <admin-jwt>"

# Revoke it (device lost or retired)
curl -X DELETE "$NORUSH_API/devices/SENSOR-101/credentials" -H "Authorization: Bearer <admin-jwt>"
```

Provisioning and rotation return the **secret once**:

```json
{ "sensorId": "SENSOR-101", "secret": "nrk_...", "credentialVersion": 1, "issuedAt": "..." }
```

Store it in the device or adapter configuration (for example, the MCU's protected storage, written over USB during provisioning). It cannot be recovered later, only rotated.

## 3. Ingestion authentication (`IOT_AUTH_MODE`)

| Mode | Behavior | Use |
| --- | --- | --- |
| `shared` (default) | Requires the shared `IOT_INGEST_KEY` in the `authToken` field | Demo and simulator |
| `device` | Requires the device's own credential; no fallback | **Real hardware** |
| `hybrid` | Accepts the device credential or the shared key | Migrating, or a mixed fleet |

The credential travels in one of these places (the header wins):

- **MQTT:** the `authToken` field of the JSON payload. TLS protects the channel.
- **HTTP:** the `X-Device-Token: nrk_...` header (preferred: it does not show up in body logs), or the `authToken` field.

Refusals return the codes `invalidDeviceCredential` (wrong secret) or `deviceNotProvisioned` (no credential issued). Over HTTP they come back as a translated error response. Over MQTT the message is dropped and the reason is logged by the API.

## 4. Transport

### 4.1 MQTT (preferred for devices with a direct connection)

| Item | Value |
| --- | --- |
| Broker | `MQTT_HOST:MQTT_PORT` (default `localhost:1883`; **8883 with `MQTT_PROTOCOL=mqtts`** for TLS) |
| QoS | 1 (at least once). Publish with QoS 1 and expect duplicates to be handled idempotently. |
| Keep-alive | 60 s |
| Client ID | Unique per device (e.g. `dev-SENSOR-101`), clean sessions |

**Per-device topics.** The topic is bound to the `sensorId`: a message published under another device's topic is dropped.

| Direction | Topic | Use |
| --- | --- | --- |
| Device → NoRush | `devices/{sensorId}/telemetry` | Level reading ([section 5](#5-telemetry-message)) |
| Device → NoRush | `devices/{sensorId}/status` | Heartbeat ([section 6](#6-heartbeat)) |
| NoRush → device | `devices/{sensorId}/commands` | Commands ([section 7](#7-commands)) |
| Device → NoRush | `devices/{sensorId}/commands/responses` | Command response |

The legacy topic `sensors/data` is still accepted for the demo (shared key). New devices must use `devices/...`.

### 4.2 HTTP (gateways, cellular, backfill)

| Endpoint | Use |
| --- | --- |
| `POST /iot/sensors/data` | One reading |
| `POST /iot/sensors/batch` | Up to 100 messages, e.g. readings buffered while offline |
| `POST /iot/sensors/heartbeat` | Sign of life without a reading |

All accept `X-Device-Token`. For LTE-M, NB-IoT or IP satellite, HTTPS is usually simpler than MQTT. For LoRaWAN, forward from the network server to the HTTP endpoints above (JSON body). `norush-edge` uses HTTP.

## 5. Telemetry message

```json
{
  "sensorId": "SENSOR-101",
  "messageId": "0a33dcd6-62a2-4f4e-97f2-cfb7d84d0c0f",
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

Rules checked by the API. A message that breaks one is rejected **before** it is stored, queued or broadcast:

- `level`: a number ≥ 0, in **meters**, within the gauge's range and the tank's height.
- `oilWaterInterface` (dual-float gauge): `oilLevel` and `waterLevel` are layer **thicknesses** and add up to `level` (1 mm tolerance). `interfaceLevel` is the **height of the interface from the tank bottom**, between 0 and `level`; on a dual-float gauge it equals `waterLevel`. A tank with more water than oil, normal on flowback, is valid.
- `batteryLevel`: 0–100.
- `timestamp`: ISO 8601 UTC, no more than 30 s in the future. If omitted, the time of receipt is used.
- `sensorId` must match the topic (MQTT) and an **active** sensor.
- `messageId`: a stable UUID generated when the reading is created. HTTP retries must reuse it so the server can deduplicate delivery.

HTTP success: `{ "processed": true, "requestId": "..." }`. An explicit validation or credential refusal returns `processed: false` with `errors[]`; do not retry it. Retry network failures, timeouts, HTTP 408, 429 and 5xx (including 503 temporary failure), and malformed 2xx responses, always with the same `messageId`. Other 4xx responses are final.

## 6. Heartbeat

On `devices/{sensorId}/status` or `POST /iot/sensors/heartbeat`. A sign of life between measurements; it does not create a reading:

```json
{ "sensorId": "SENSOR-101", "authToken": "nrk_...", "batteryLevel": 87.5, "firmwareVersion": "0.9.0", "signalStrength": -72 }
```

It updates `lastTransmissionAt` (the console shows a device as online for 5 minutes after it), battery, firmware and signal. Recommended: one heartbeat every 3–4 measurement cycles, and after events (boot, reconnection, sensor error). HTTP `{ "received": true }` is success and `{ "received": false }` is a final refusal; apply the same temporary-failure and malformed-2xx retry rules as for readings.

## 7. Commands

Published on `devices/{sensorId}/commands`; the device answers on `devices/{sensorId}/commands/responses`:

```json
{ "command": "DIAGNOSTIC", "requestId": "req_...", "parameters": {}, "timestamp": "..." }
```

Defined commands act on the **device only**: `CALIBRATE`, `RESET`, `UPDATE_CONFIG`, `DIAGNOSTIC`, `SHUTDOWN` (power the device down). NoRush never commands field equipment. Subscribe to the command topic with QoS 1 and answer with `{ "requestId": "...", "status": "SUCCESS" | "FAILED", "data": {} }`.

## 8. Power and reporting interval (design guidance)

- Suggested measurement interval: 15 minutes. It feeds the forecasts and the 5-minute and 1-hour aggregates.
- Send telemetry right after measuring. Group readings with `batch` when the radio costs more than the measurement (e.g. satellite).
- Sleep between cycles with the sensor and radio off. The heartbeat exists to keep the "online" state at minimum power.
- A `batteryLevel` below 20% lowers the reading's quality indicator and raises a battery alert on the next scheduled check.

## 9. Bring-up sequence (first physical device)

1. `npm run infra:up && npm run seed`: the platform runs with demo tanks.
2. Set `IOT_AUTH_MODE=device` in `.env` and restart the API.
3. Provision the device (console or `POST /devices`) on the real tank.
4. Configure the device: `sensorId`, secret, broker and TLS (or the HTTP URL).
5. Send a heartbeat and check the console (Sensors → online).
6. Send telemetry with a plausible level and check the overview and reading history.
7. Force an error (a level out of range) and confirm the rejection in the API log.

## 10. Security status of this release

Done: per-device credentials (sha256, constant-time comparison), rotation and revocation, topic binding, rejection before persistence, TLS for MQTT and HTTPS, rate limiting and OpenAPI.

Not yet (track it as the project grows): per-device certificates (mTLS), per-topic broker ACLs, signed OTA updates, intrusion detection and zero-touch provisioning.
