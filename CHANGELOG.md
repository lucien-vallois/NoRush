# Changelog

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
