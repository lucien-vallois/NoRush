# Readings module

Stored gauge readings and the history built on them: lists, statistics, and
the 5-minute and 1-hour series behind the console charts. Readings arrive
through the IoT gateway (MQTT or HTTP, validated before storage, see
[iot-gateway](../iot-gateway/README.md)); this module reads them back.

| File | Role |
| --- | --- |
| `readings.service.ts` | Queries, statistics, aggregates, volume recalculation, retention cleanup |
| `readings.controller.ts` | REST API |
| `dto/reading-filters.dto.ts` | List filters, pagination and the sort whitelist |
| `dto/create-reading.dto.ts` | Manual reading entry |

## Units and storage

- `level` is in **meters** from the tank bottom, `volume` in **liters** (from
  the tank's strapping table, or the cylinder when it has none). The console
  converts to ft/bbl; the API never does.
- `oilWaterInterface` holds `oilLevel` and `waterLevel` (layer thicknesses that
  add up to `level`) and `interfaceLevel` (height of the interface).
- `readings` is a TimescaleDB hypertable keyed by `(id, timestamp)`, so rows are
  written with `insert()`, never `save()`.

## History series

`GET /readings/timeseries` serves the charts from two views:

| `bucket` | Source | Columns |
| --- | --- | --- |
| `1h` (default) | `readings_1h` | `bucket`, `sensorId`, avg/min/max level, avg/max volume, avg oil and water layer, avg quality, sample count |
| `5m` | `readings_5m` | same |
| `raw` | `readings` | the stored readings |

- Optional filters: `sensorId`, `tankId`, `from` and `to` (ISO 8601; `to` is
  exclusive). `limit` defaults to 1,000 points and is capped at 10,000; the
  most recent points are returned, in time order.
- With TimescaleDB the views are continuous aggregates that include the
  not-yet-materialized tail, with compression and retention policies. On
  PostgreSQL without the extension (a hosted demo) they are plain views with
  the same columns, computed on each query. See `../timescale/timescale.service.ts`.
- Any other `bucket` is refused with 400.

## API

All routes need a signed-in user; writes need the roles shown.

| Route | Purpose |
| --- | --- |
| `GET /readings` | Paginated list with filters (below) |
| `GET /readings/:id` | One reading |
| `GET /readings/sensor/:sensorId`, `/tank/:tankId` | Same list, scoped (internal UUIDs) |
| `GET /readings/sensor/:sensorId/latest`, `/tank/:tankId/latest` | Most recent readings, 10 by default (`limit`); tank latest uses only its selected operational level sensor |
| `GET /readings/sensor/:sensorId/stats`, `/tank/:tankId/stats`, `/global/stats` | Count, level and volume statistics, trend and quality distribution (`startDate`, `endDate`) |
| `GET /readings/sensor/:sensorId/hourly`, `/tank/:tankId/hourly`, `/global/hourly` | Hourly averages from the raw table, last 24 hours by default (`hours`) |
| `GET /readings/timeseries` | Chart series, see above |
| `POST /readings` | Manual reading (admin, maintenance); volume from the strapping table when not given |
| `POST /readings/maintenance/recalculate-volumes` | Recompute volumes of readings without one (admin; optional `sensorId`) |
| `POST /readings/maintenance/cleanup` | Delete readings older than `daysToKeep` days (admin; default 90, at least 1) |

List filters for `GET /readings`: `sensorId`, `tankId`, `startDate`,
`endDate`, `minLevel`/`maxLevel`, `minVolume`/`maxVolume`, `minQuality`
(0–100), `calibratedOnly`, `processedOnly` (`true`/`false`), `page` and
`limit` (1–1,000, default 100). `sortBy` is one of `timestamp`, `level`,
`volume`, `quality`, `createdAt`, and `sortOrder` is `ASC` or `DESC`: both go
into `ORDER BY`, so anything outside that whitelist is refused with 400.

A malformed id in the path answers 400 (`invalidIdentifier`), not 500.

## Tests

- `dto/reading-filters.dto.spec.ts`: sort whitelist, limits, boolean filters
  sent as query text.
- `readings.controller.spec.ts`: retention cleanup refuses less than one day.
- End to end, `npm run smoke` stores readings through the gateway and reads
  them back from the latest-readings route and the 5-minute series, against a
  real database.
