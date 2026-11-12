# IoT gateway module

Ingestion of gauge telemetry over MQTT and HTTP. Both transports go through the
same `MessageProcessorService`, so a reading is validated, authenticated and
checked against the tank before anything is stored, queued or broadcast.

```
gauge ──MQTT──┐
              ├─► MessageProcessor ─► readings (PostgreSQL/TimescaleDB)
gauge ──HTTP──┘        │            ├─► level alarms (AlertProcessor)
                       │            ├─► realtime event (Socket.IO)
                       │            └─► derived event (RabbitMQ, optional)
                       └─ rejected readings: logged, never stored
```

The device-facing contract (topics, payloads, credentials, heartbeat, commands)
is specified in [docs/hardware-integration.md](../../../../docs/hardware-integration.md).
This page covers the server side.

## Components

| File | Role |
| --- | --- |
| `mqtt.service.ts` | Broker client. Subscribes to `sensors/data`, `sensors/+/data`, `sensors/+/status` and the per-device topics `devices/+/telemetry`, `devices/+/status`, `devices/+/commands/responses` (the sensorId in the topic must match the payload). |
| `http.service.ts` | HTTP ingestion (single reading, batch of up to 100, heartbeat) and the gauge status read from the database. |
| `message-processor.service.ts` | Validation, device authentication, level → volume through the strapping table, storage, alarms, realtime and derived events. Keeps the ingestion counters. |
| `device-commands.service.ts` | Device commands over MQTT and their status as reported by the device. |
| `iot-gateway.service.ts` | Counters, connectivity check, effective settings, broker reconnection. |

## HTTP routes

| Method and path | Access | Purpose |
| --- | --- | --- |
| `POST /iot/sensors/data` | device credential | One reading |
| `POST /iot/sensors/batch` | device credential | Up to 100 readings, each validated on its own (backfill after an outage) |
| `POST /iot/sensors/heartbeat` | device credential | Sign of life without a level: last transmission, battery, firmware, signal |
| `GET /iot/sensors/:sensorId/status` | signed-in user | Connectivity as last reported by the gauge |
| `POST /iot/sensors/commands` | admin, maintenance | Publish a command to a device |
| `GET /iot/sensors/commands/:requestId` | admin, maintenance | Command status |
| `GET /iot/gateway/stats` | signed-in user | Counters since the API started |
| `GET /iot/gateway/health` | signed-in user | Database and MQTT checked live; RabbitMQ is not probed (`null`) |
| `GET /iot/gateway/config` | admin | Effective settings, without credentials |
| `POST /iot/gateway/restart` | admin | Reconnect to the MQTT broker |
| `POST /iot/test/simulate`, `GET /iot/test/echo` | admin, development only | Refused when `NODE_ENV=production` |

The credential travels in the `X-Device-Token` header (preferred) or as
`authToken` in the body. With `IOT_AUTH_MODE=shared` it is the shared
`IOT_INGEST_KEY`; with `device` it is the per-gauge credential issued in the
console; `hybrid` accepts either.

### A reading

Levels are in meters from the tank bottom. `oilLevel` and `waterLevel` are layer
thicknesses that add up to `level` (1 mm tolerance); `interfaceLevel` is the
height of the oil/water interface, between 0 and `level`.

```http
POST /iot/sensors/data
Content-Type: application/json
X-Device-Token: nrk_...

{
  "sensorId": "SENSOR-001",
  "level": 3.45,
  "oilWaterInterface": { "oilLevel": 1.2, "waterLevel": 2.25, "interfaceLevel": 2.25 },
  "batteryLevel": 85.5,
  "timestamp": "2026-11-12T10:30:00Z",
  "metadata": { "signalStrength": -71 }
}
```

```json
{
  "sensorId": "SENSOR-001",
  "received": true,
  "processed": true,
  "timestamp": "2026-11-12T10:30:01.204Z",
  "requestId": "req_5f0c..."
}
```

A rejected reading answers `processed: false` with the reasons in `errors`
(unknown or inactive gauge, refused credential, level outside the gauge range
or above the tank height, inconsistent interface, timestamp in the future).

### Commands

Commands act on the gauge only (`CALIBRATE`, `RESET`, `UPDATE_CONFIG`,
`DIAGNOSTIC`, `SHUTDOWN`); NoRush never commands field equipment. The command
is published on `devices/{sensorId}/commands`, and its status is whatever the
device answers on `devices/{sensorId}/commands/responses`:

- `PENDING` until the device answers;
- `SUCCESS` or `FAILED`, as reported by the device, with its `message` and `data`;
- `TIMEOUT` after 60 seconds without an answer.

Without a broker connection the request is refused with 503 instead of being
reported as sent. Tracking is in memory and does not survive a restart.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `MQTT_ENABLED` | `true` | `false` for an HTTP-only deployment: no connection attempts, health shows MQTT as `disabled` |
| `MQTT_HOST`, `MQTT_PORT` | `localhost`, `1883` | |
| `MQTT_PROTOCOL` | `mqtt` | `mqtts` validates the broker certificate unless `MQTT_REJECT_UNAUTHORIZED=false` |
| `MQTT_USER`, `MQTT_PASS` | | Broker credentials |
| `MQTT_TOPIC_SENSOR_DATA` | `sensors/data` | Shared telemetry topic |
| `MQTT_QOS` | `1` | |
| `IOT_AUTH_MODE` | `shared` | `shared`, `device` or `hybrid` |
| `IOT_INGEST_KEY` | | Shared ingestion key; required in production for `shared`/`hybrid` |
| `RABBITMQ_ENABLED` | `true` | `false` skips the derived `sensor.data.processed` events |
| `RABBITMQ_HOST`, `RABBITMQ_PORT`, `RABBITMQ_USER`, `RABBITMQ_PASS` | | |

RabbitMQ is downstream of storage: when it is down, readings are still stored
and the failure is logged at most once a minute.

## Tests

- Unit: `message-processor.service.spec.ts` (validation, credentials, heartbeat)
  and `device-commands.service.spec.ts`.
- End to end: `npm run smoke:telemetry` from the repository root (MQTT →
  processing → database → authenticated WebSocket), and the simulator,
  `npm run simulate` / `npm run simulate:http`.
