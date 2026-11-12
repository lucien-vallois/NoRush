# Sensors module (gauges)

The gauge registry. In NoRush a "sensor" is the gauge mounted on a tank,
normally one dual-float magnetostrictive gauge per tank that reports the total
level and the oil/water interface. This module stores what each gauge is and
what it last reported; the readings themselves live in the
[readings](../readings/README.md) module, and gauge credentials in `devices`.

| File | Role |
| --- | --- |
| `sensors.service.ts` | Registry, filters, connectivity, calibration and firmware records, dashboard figures |
| `sensors.controller.ts` | REST API |
| `dto/create-sensor.dto.ts`, `dto/update-sensor.dto.ts`, `dto/sensor-filters.dto.ts` | Input validation |
| `../../entities/sensor.entity.ts` | Columns, online and battery rules |

## Two identifiers

Every gauge has an internal `id` (UUID, used by readings and alerts) and a
`sensorId`, the device ID it reports with (`SENSOR-001`). Routes with `:id`
take the UUID; `GET /sensors/by-sensor-id/:sensorId` looks a gauge up by its
device ID. A malformed UUID answers 400 (`invalidIdentifier`).

## Rules

| What | Rule |
| --- | --- |
| Online | Reported (reading or heartbeat) within the last 5 minutes |
| Battery | `good` from 20%, `warning` from 10%, `critical` below 10% (0% included); unknown when never reported. "Low battery" lists gauges at 20% or less |
| Needs calibration | `nextCalibrationDate` has passed, or no calibration was ever recorded |
| Calibration record | Sets today as `calibrationDate` and the next one 6 months later |
| Delete | Refused with 409 (`sensorHasReadings`) while the gauge has readings: set it `inactive` to keep its history |
| Bulk changes | 1 to 100 gauges per request |

Types: `magnetostrictive` (the dual-float gauge, the console's default),
`radar_level`, `float_switch`, `ultrasonic`, `pressure`,
`capacitive`. Protocols: `mqtt`, `http`, `modbus`, `lorawan`. Statuses:
`active`, `inactive`, `maintenance`, `error`, `offline`. Only `active` gauges
have their readings accepted by the gateway.

The dashboard (`GET /sensors/dashboard`) adds a health score from 0 to 100:
50% share of gauges online, 30% not in maintenance, 20% battery above 20%.

## API

All routes need a signed-in user; writes need the roles shown.

| Route | Purpose |
| --- | --- |
| `GET /sensors` | List, newest first. Filters: `type`, `protocol`, `status`, `tankId`, `model`, `manufacturer`, `search` (name or device ID), and `onlineOnly`, `needsCalibration`, `lowBattery` (`true`/`false`) |
| `GET /sensors/:id`, `/by-sensor-id/:sensorId` | One gauge, with its tank |
| `GET /sensors/:id/stats` | Reading count, level range, first and last reading, readings in the last 24 hours, battery status |
| `GET /sensors/dashboard` | Totals, distribution by type and protocol, health score |
| `GET /sensors/online`, `/maintenance-needed`, `/low-battery` | Prepared lists |
| `GET /sensors/tank/:tankId`, `/type/:type`, `/status/:status` | Shortcuts |
| `POST /sensors` | Register a gauge (admin, maintenance); the device ID must be unique and the tank must exist |
| `PATCH /sensors/:id` | Update (admin, maintenance) |
| `DELETE /sensors/:id` | Delete a gauge without readings (admin) |
| `POST /sensors/:id/calibration` | Record a calibration (admin, maintenance) |
| `POST /sensors/:id/firmware` | Record the firmware version (admin, maintenance) |
| `POST /sensors/bulk/status` | Set the status of several gauges (admin, maintenance) |
| `POST /sensors/bulk/calibration` | Record today's calibration for several gauges (admin, maintenance) |

## Credentials

Per-gauge ingestion credentials are issued, rotated and revoked by the
`devices` module (admin only): `GET /devices`, `POST /devices`,
`POST /devices/:sensorId/credentials` (new credential, shown once) and
`DELETE /devices/:sensorId/credentials`. Only a hash is stored. How a gauge
presents the credential is described in
[docs/hardware-integration.md](../../../../docs/hardware-integration.md).

## Tests

- `sensors.controller.spec.ts`: bulk calibration bounds.
- `dto/sensor-filters.dto.spec.ts`: boolean filters sent as query text.
- `../../entities/sensor.entity.spec.ts`: battery status.
- `../devices/devices.service.spec.ts`: credential issue, rotation and revocation.
- End to end, `npm run smoke` reads the dashboard and the list.
