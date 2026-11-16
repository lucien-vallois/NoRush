# Alerts module

Raises alerts from gauge readings and periodic checks, and records each one
from the moment it is raised until someone resolves it (who acknowledged it,
who resolved it, and what they did).

| File | Role |
| --- | --- |
| `level-alarms.ts` | The level alarm rules, as a pure function shared by ingestion and alert creation |
| `alert-processor.service.ts` | Runs the rules for each stored reading, plus checks every 5 minutes (offline gauges, low battery, maintenance/calibration due, gauge errors) |
| `alerts.service.ts` | Alert records: creation, filters, acknowledgment, resolution, bulk actions |
| `notification.service.ts` | E-mail, SMS, push and Slack channels: **placeholders**, see below |
| `alerts.controller.ts` | REST API |

## Level alarms

Tank limits are measured from the tank bottom, in the order
`minimum ≤ low < high ≤ overflow` (validated when a tank is saved).

| Alarm | Trips when | Type | Severity | Cooldown |
| --- | --- | --- | --- | --- |
| overflow | level ≥ overflow limit | `overflow_risk` | critical | 15 min |
| minimum | level ≤ minimum limit | `low_level` | high | 15 min |
| high | level ≥ high limit | `high_level` | medium | 30 min |
| low | level ≤ low limit | `low_level` | medium | 30 min |

- Limits are inclusive; an empty (or zero) limit is not monitored.
- A level past an outer limit also trips the inner one, and both alerts are
  raised. The realtime event announces the most severe.
- Each alarm has its own cooldown per gauge, so the minimum alarm is never
  muted by the low one.
- While an alert of the same type and severity is pending or acknowledged on
  the same tank and gauge, a repeat trip returns that alert instead of opening
  another. Once it is resolved, the next crossing opens a new one.

Forecast-based overflow alerts come from the predictions module: a linear fit
reaching the overflow limit within 6 hours (critical within 2 hours). They use
the same one-open-alert rule and a one-hour cooldown stored in the alerts table,
so restarting the API does not reset their deduplication.

## Periodic checks (every 5 minutes)

| Alert | Condition | Severity |
| --- | --- | --- |
| `sensor_offline` | active gauge with no report in the last 5 minutes | high |
| `battery_low` | battery at or below 20% | medium |
| `maintenance_due` | tank `nextMaintenanceDate` has passed | low |
| `calibration_due` | gauge `nextCalibrationDate` has passed | low |
| `sensor_error` | more than 10 errors reported by the gauge | high |

Cooldowns are kept in memory and reset when the API restarts; the
one-open-alert rule above is what prevents duplicates across restarts.

## Notifications

Alerts reach people through the console (alert center and live toasts over
Socket.IO). The e-mail, SMS, push and Slack channels are placeholders, off by
default (`EMAIL_ENABLED`, `SMS_ENABLED`, `PUSH_ENABLED`, `SLACK_ENABLED`):
when enabled they build the message a real integration would send, log that it
was **not** sent, and `GET /alerts/notifications/status` reports
`delivers: false`.

## API

All routes need a signed-in user; the ones marked admin need that role.

| Route | Purpose |
| --- | --- |
| `GET /alerts` | Search, filters (status, severity, type, tank, period) and pagination |
| `GET /alerts/:id` | One alert |
| `GET /alerts/dashboard`, `/active`, `/critical`, `/unacknowledged`, `/requiring-action` | Prepared views |
| `GET /alerts/tank/:tankId`, `/type/:type`, `/severity/:severity`, `/status/:status` | Shortcuts |
| `POST /alerts` | Manual alert (admin, maintenance) |
| `POST /alerts/:id/acknowledge` | Acknowledge, with an optional `notes` |
| `POST /alerts/:id/resolve` | Resolve, with `resolutionNotes` |
| `POST /alerts/bulk/acknowledge`, `/bulk/resolve` | Up to 100 alerts at once |
| `GET /alerts/processor/stats` | Level alarm cooldowns |
| `GET /alerts/notifications/status` | Channel status |
| `POST /alerts/notifications/test/:channel` | Channel test (admin) |
| `POST /alerts/processor/check-offline`, `check-battery`, `check-maintenance`, `check-errors` | Run a periodic check now (admin) |

Titles and messages come back in the language of `Accept-Language` (English,
Portuguese, Spanish) and the unit system of `?units=imperial|metric`.

With `DEMO_READ_ONLY=true`, acknowledging and resolving stay available; the
other writes are refused.

## Tests

`level-alarms.spec.ts` (rule order, severities, inclusive limits, unset limits)
and `alerts.service.spec.ts` (one open alert per condition). End to end, the
smoke test creates, acknowledges and resolves an alert and exercises the bulk
routes (`npm run smoke`).
