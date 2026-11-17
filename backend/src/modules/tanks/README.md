# Tanks module

Tank configuration and the consolidated operational view used by the console.
All routes require a signed-in user.

## Operational state

- `GET /tanks/state` returns `{ generatedAt, tanks }`, with one entry for every
  tank, including tanks without a level sensor.
- `GET /tanks/:id/state` returns one entry and answers 404 when the tank does
  not exist.

Each entry contains the tank status, the selected sensor's internal UUID and
type, its latest level and oil/water interface, reading and heartbeat
timestamps/freshness, whether a critical alarm is open, a forecast, and
`forecastError`. The reading is at or before the request's single `generatedAt`
instant. Stale values remain visible with `fresh: false`; readings are fresh
for at most 900 seconds and heartbeats for at most 300 seconds. Missing,
invalid, or future timestamps have `fresh: false` and `ageSeconds: null`.

Only active tanks have forecasts. A forecast is attached only when its sensor
UUID matches the operational sensor and its `lastReadingAt` exactly equals the
response's `readingTimestamp` (`null === null` is valid). If telemetry arrives
while the forecast is being calculated and those timestamps diverge, the
response has `forecast: null` and `forecastError: false`. If forecast
calculation rejects, readings, interfaces, heartbeats, and alarms are still
returned; the affected active tanks with a level sensor have `forecast: null`
and `forecastError: true`. It is `false` for tanks without a level sensor and
for non-active tanks. A forecast failure is never converted into a normal or
stale forecast.

The operational level sensor is active and is not a `float_switch`. Selection
priority is magnetostrictive, radar, ultrasonic, pressure, capacitive, then any
other continuous type, with the physical `sensorId` as the tie-breaker. The
same query definition is shared with forecasts and latest-by-tank readings.
There is no fallback to a newer secondary sensor. These GET routes only read
state; they do not create alerts. A failure to query alarms is propagated
rather than reported as no alarm.

## Tests

- `tank-config.spec.ts` covers dimensional and threshold validation.
- `tank-operational-state.service.spec.ts` covers sensor/forecast consistency,
  interfaces, stale telemetry, independent heartbeat freshness, missing
  sensors/readings, maintenance, alarms, and unknown tanks.
- `../../common/telemetry-freshness.spec.ts` covers freshness boundaries and
  invalid or future timestamps.
