# NoRush API

NestJS/TypeScript API behind the NoRush console. It validates gauge telemetry, converts level to volume, stores readings in PostgreSQL/TimescaleDB, raises alerts, computes forecasts and pushes live updates to the console.

## Run from the repository root

```powershell
npm ci
npm run setup:demo
npm run infra:up
npm run seed
npm run demo
```

See the [demo walkthrough](../DEMO.md) for the simulator and the local demo accounts. To work on the API alone: `npm run start:dev --workspace=backend`. For a real install, see [Production install](../docs/production-install.md).

## Modules

Each module that carries business rules has its own reference:
[alerts](src/modules/alerts/README.md) (level alarms, severities, the one-open-alert rule),
[iot-gateway](src/modules/iot-gateway/README.md) (ingestion and device commands),
[readings](src/modules/readings/README.md) (history and the 5-minute/1-hour series),
[sensors](src/modules/sensors/README.md) (the gauge registry) and
[reports](src/modules/reports/README.md) (Excel, CSV and PDF exports).

## Main routes

All paths are relative to the API base (`http://localhost:3000` locally). The full reference is OpenAPI at `/api/docs`.

| Route | Purpose |
| --- | --- |
| `POST /auth/login` | Check credentials and issue access and refresh tokens |
| `POST /auth/refresh` | Renew access with a refresh token |
| `GET /auth/profile` | The signed-in user |
| `POST /auth/logout`, `POST /auth/logout/all` | Sign out this session, or every session of the user |
| `POST /auth/users` | Create a user (admin) |
| `GET /tanks`, `POST /tanks`, `PATCH /tanks/:id` | Fleet, tank setup (admin, maintenance) |
| `GET /sensors`, `GET /sensors/dashboard` | Gauges and their stats; online = reported in the last 5 minutes |
| `POST /devices`, `POST /devices/:sensorId/credentials`, `DELETE /devices/:sensorId/credentials` | Register a gauge, issue a new credential, revoke it (admin) |
| `POST /iot/sensors/data` | Ingest one reading; check `processed` in the response |
| `POST /iot/sensors/batch` | Ingest up to 100 readings |
| `POST /iot/sensors/heartbeat` | Sign of life without a reading |
| `GET /readings/timeseries` | History per gauge or tank, bucket `5m`, `1h` or `raw` |
| `GET /predictions` | Trend, fit (R²), reading age and ETA when the fit allows |
| `GET /gauge-reports`, `GET /gauge-reports/csv` | Gauge report for a gauge day or a 12-hour shift (`period`, `date`, `startHour`, `tz`; CSV takes `units`) |
| `GET /alerts` | Paginated alerts with filters |
| `POST /alerts/:id/acknowledge` | Record the acknowledgment and who did it |
| `POST /alerts/:id/resolve` | Record the resolution, who did it and the notes |
| `GET /health` | API, database and MQTT; 503 when the database is down |

Domain routes need an access token and check the user's role; health and login are public.

Ingestion has its own credentials, set by `IOT_AUTH_MODE`: the shared `IOT_INGEST_KEY` (`shared`, the demo default), a per-gauge credential (`device`), or either (`hybrid`). They are checked in the processing step shared by MQTT, HTTP and batch. The device contract is in [Hardware integration](../docs/hardware-integration.md).

A 2xx status means the message was received, not that it was accepted: a reading out of range returns `processed: false` and is not stored.

## Live events

The Socket.IO client sends `auth: { token: accessToken }` in the handshake. Anonymous or invalid connections are refused, and a connection is closed when its token expires.

Data events use this envelope:

```json
{
  "type": "reading",
  "payload": {
    "sensorId": "SENSOR-001",
    "tankId": "uuid",
    "level": 1.25,
    "volume": 10053,
    "timestamp": "2026-11-01T12:00:00.000Z"
  },
  "timestamp": "2026-11-01T12:00:00.100Z"
}
```

Values are illustrative. `level` is in meters and `volume` in liters; the console converts for display.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run seed` | Demo tanks, gauges and accounts. Keeps a database that already has tanks; `FORCE_SEED=1` erases and reseeds. **Never in production.** |
| `npm run backfill` | Simulated history straight into the database (`DAYS`, default 90). |
| `npm run admin:create` | First administrator for a real install (see [Production install](../docs/production-install.md#3-first-administrator)). |
| `npm run migration:generate`, `npm run migration:run` | Database migrations. In production the API applies pending migrations on start. |

## Verify

From the repository root:

```powershell
npm run check
npm run smoke
npm run smoke:telemetry
```

The unit tests cover input limits, authentication, ingestion without side effects for invalid messages, device credentials, forecasts, secret configuration and the authenticated event channel. The smoke tests use the real local API and demo database. Scenarios and limits are in the [validation log](../docs/VALIDATION.md).

## Limits

- In development the schema follows the entities (`synchronize`); in production only migrations change it.
- Sign-out revokes one session on the server (its access and refresh tokens and new WebSocket connections); refresh tokens are not rotated with reuse detection yet.
- The report API exports every type to Excel (and CSV, except the system overview); PDF exists for the alert summary only, and the catalog offers it only there. Reports are on demand: nothing is scheduled or sent.
- Notification channels (`EMAIL_ENABLED`, `SMS_ENABLED`, `PUSH_ENABLED`, `SLACK_ENABLED`) are placeholders: they build the message but do not send it. Alerts reach people through the console only.
- No OAuth2 and no Prometheus metrics endpoint in this release.
