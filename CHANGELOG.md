# Changelog

## Unreleased

### Fixed

- **Level alarms.** The low limit never raised an alarm on its own, the minimum (low-low) alarm was rated less severe than the low one and was muted by its cooldown, a level past the overflow limit was announced in real time as "high level", and low-level alerts always stored the minimum limit as their threshold. Both evaluation paths now share one rule set, ordered overflow > minimum > high > low.
- **Alert flood.** A condition that stays active (a level past a limit, a gauge offline) no longer opens a new alert every cooldown while the previous one is pending or acknowledged. Maintenance and calibration alerts need a due date that has passed, instead of firing for every tank or gauge without a schedule.
- **Invented gateway data.** `GET /iot/sensors/:id/status` returned random connectivity, battery and signal; it now reads the gauge's last report. Device commands were never published and turned "SUCCESS" at random; they now go out on `devices/{id}/commands` and report what the device answers, or a timeout. Gateway counters count real traffic, and the 5-minute health check no longer warns about a 0% success rate on an idle gateway.
- **Notification channels.** The e-mail, SMS, push and Slack placeholders logged "sent" after a fake delay; they now say they are placeholders, and their status reports `delivers: false`.
- **Reports.** The catalog offered PDF for six report types while only the alert summary has a layout (the others crashed with a 500); PDF output is a real binary buffer with Puppeteer 22+.
- **Acknowledgment notes** sent to the API are kept (they were dropped).
- Gauge statistics reported 0 readings in the last 24 hours: the query compared timestamps for equality instead of "since".
- The batch ingestion route validates every reading and accepts the `X-Device-Token` header.

### Added

- **Per-session sign-out.** Logout ends only the current session (its access and refresh tokens and WebSocket); `POST /auth/logout/all` signs out everywhere. Migration `1799000002000-AddRevokedSessions`.
- **Hosted demo** ([guide](docs/deploy-railway.md)): `DATABASE_URL`/`PG*` support, plain-view fallback without TimescaleDB, `DEMO_AUTO_SEED`, `MQTT_ENABLED=false` and `RABBITMQ_ENABLED=false` for an HTTP-only host, `TRUST_PROXY`, a continuous HTTPS simulator worker, and `npm start` for the console.
- **Read-only demo mode** (`DEMO_READ_ONLY=true`): writes are refused except sign-in/out, device ingestion and alert acknowledgment/resolution; the console shows a banner (`GET /meta`).
- Admin-only gateway configuration and broker reconnection; commands limited to admin and maintenance.

### Engineering

- `npm run check` runs ESLint on the API and the console before building and testing (5,109 reported problems to 0). The console's lint setup works and TypeScript runs in strict mode.
- **Production audit: 45 vulnerabilities (3 critical) to 0.** Unused packages removed, Puppeteer 25, bcrypt 6, SheetJS 0.20.3 from its official registry, and these major upgrades:
  - NestJS 10 → 11 (Express 5), TypeORM 0.3 → 1.1, @nestjs/config 4, @nestjs/schedule 6, @nestjs/swagger 11;
  - React Router 6 → 7 (imports from `react-router`) and Vite 5 → 7 in the console.
  NestJS 12 gives the same audit result but ships ESM-only packages that Jest can load only on Node.js 24.9+, so it waits for the move to Node 24. What `npm audit` still reports is in development tooling (Jest, typescript-eslint, Nest CLI) and needs their next majors.
- Prettier applied to the API, LF line endings pinned with `.gitattributes`, and `.git-blame-ignore-revs` for the formatting commit.
- Unit tests: 114 → 146 on the API.

## 0.1.0: first public release

Software prototype, exercised with simulated gauges and against a vendor's published Modbus register layout. Not yet run against a live gauge gateway.

### Console

- Operations overview: level and fill per tank, high-level limit, reading age, 24-hour trend, pending alerts, 6-hour overflow window, service health.
- Tanks: map, detail drawer, and setup forms with alarm limits and a strapping table pasted from the gauge chart (feet-inches and bbl accepted).
- Gauges: one dual-float gauge per tank (total level + oil/water interface), battery and signal, and per-gauge credentials issued once, rotated or revoked from the console.
- Reading history with 5-minute and 1-hour aggregates for level and interface.
- Gauge report, daily (gauge day, 7:00 to 7:00 by default) or 12-hour day and night shifts: opening and closing gauges in ft-in, oil and water opening, closing, removed and produced per tank, removals (hauls, transfers, draining) detected from the level, CSV download and print layout. Handles daylight-saving days.
- Alert center: search, filters, acknowledgment and resolution with who acted and what was done.
- Imperial (ft/bbl, default) or metric units; English, Portuguese and Spanish.

### Server

- NestJS API with JWT auth, roles, rate limiting, OpenAPI docs and health checks.
- PostgreSQL/TimescaleDB with a hypertable and continuous aggregates; production migrations and a first-admin command.
- Ingestion over HTTP and MQTT, validated before storage, with shared-key or per-device authentication.
- Overflow and minimum-level forecasts by linear fit (R² ≥ 0.50, 72-hour horizon), suspended when data is stale.

### Pad adapter (`norush-edge`)

- Reads gauges from a vendor Modbus gateway (TCP, RS-485 RTU, RTU over TCP) and sends them over HTTPS with each gauge's credential.
- Register-map profiles, word-order auto-detection, disk buffer while offline, `check` command for commissioning.

### Fixes before release

- The tank map frames the registered tanks instead of a fixed location, and tanks without coordinates are left off the map.
- Alert rows show the reading and limit in the selected units (they were always in meters).
- API errors are translated (English, Portuguese, Spanish by `Accept-Language`), and device validation errors are in English.
- All packages are MIT-licensed and versioned 0.1.0.
- Bulk acknowledge/resolve alert routes were unreachable (declared after the `:id` routes, so `bulk` matched `:id`); they now come first and are covered by the smoke suite.
- Reading sort fields are validated against a whitelist before entering `ORDER BY`, and numeric query filters (`limit`, level/volume/quality ranges) are converted as numbers instead of failing validation.
- Logout revokes the session: the user's token version is bumped and previously issued access and refresh tokens are refused immediately, including the realtime WebSocket.
- `/iot/test/*` endpoints are admin-only and refused outright in production.

### Docs

- User guide, adapter manual, production install, validation log.
- English hardware integration contract, demo walkthrough and backend README; Portuguese versions kept.
- Contributing guide, security policy, issue and pull request templates.
- `npm run screenshots` regenerates the README and user-guide images.
