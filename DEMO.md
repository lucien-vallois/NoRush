# NoRush in five minutes

The goal is to show how a gauge reading becomes operating context and an alarm record. Every number in this walkthrough is simulated, and no field equipment is controlled. [Português](DEMO.pt-BR.md).

## Prepare once

From the repository root, with Node.js 22.20+ and Docker Desktop running:

```powershell
npm ci
npm run setup:demo
npm run infra:up
npm run seed
```

`setup:demo` writes a `.env` with locally generated secrets. An existing `.env` and existing tanks are kept. Variables in `backend/.env.local` or `backend/.env` take precedence, so do not keep old, conflicting settings there.

For charts with history from the start, load two days of simulated readings (optional; see [Optional history](#optional-history)):

```powershell
$env:DAYS = '2'; npm run backfill --workspace=backend; Remove-Item Env:DAYS
```

## Start

Terminal 1:

```powershell
npm run demo
```

Terminal 2, also from the root:

```powershell
npm run simulate
```

Open [localhost:3001](http://localhost:3001), click **Fill demo credentials** and sign in as the operator. By default the simulator runs for **five minutes**. For development with automatic reload, use `npm run dev` instead of `npm run demo`.

## Walkthrough

1. **Operations overview.** Explain the counts: active out of registered tanks, and gauges transmitting out of active gauges. Installed capacity is nominal tank size, not measured inventory.
2. **Levels.** Pick a tank and show the level, the fill relative to height and the configured high-level limit. The age of the reading separates fresh data from a gauge that stopped reporting.
3. **Units.** Toggle ft/bbl and m/L in the header. The database stores metric; only the display changes.
4. **Tanks.** Open the map and the detail drawer. Compare the reading with the tank limits, the rate and the time-to-overflow estimate.
5. **Sensors.** Show connection, battery and status for each gauge. FK-06 is in maintenance, and the simulation drains FK-04's battery until it goes silent.
6. **Reading history.** Choose a tank and its gauge. Compare 5-minute and 1-hour buckets, and show the oil/water interface from the same gauge. Long history only appears if it was loaded.
7. **Gauge report.** Open the daily report for the last gauge day, then the day and night shifts. Show the opening and closing gauges in ft-in, a haul detected as a removal in the notes, and production = closing − opening + removed. Download the CSV and open it in a spreadsheet.
8. **Alert center.** Search for an alert, filter by status, acknowledge it, and record the action taken when resolving it. To exercise this on a record made for testing, use the synthetic alert created by `npm run smoke`.
9. **Setup (admin).** Sign out and sign in as the admin (`admin@flowback.com` / `admin123`). In **Tanks → New tank**, paste a gauge chart in feet-inches and bbl. In **Sensors → Register gauge**, show the device credential that is displayed only once. Cancel or delete what you create, so the demo stays clean.
10. **API.** Open the [OpenAPI docs](http://localhost:3000/api/docs). Explain input validation, role checks and the authenticated event channel.

## Simulation speed

The model uses flows in m³/h, reading noise, battery drain and transmission losses. `SIM_SPEED` speeds up the physics while timestamps stay on the real clock, so rates and ETAs from an accelerated demo must not be presented as measured field flows.

Generated settings: `SIM_SPEED=60`, `SIM_INTERVAL=5000`, `SIM_DURATION=300000`.

To run the physics at real speed:

```powershell
$env:SIM_SPEED = '1'
npm run simulate
Remove-Item Env:SIM_SPEED
```

## Prove it works

With the API and infrastructure running, stop the simulator so scenarios do not interfere, then run:

```powershell
npm run check
npm run smoke
npm run smoke:telemetry
```

The HTTP smoke test creates a synthetic reading and alert, acknowledges and resolves that alert, and keeps the record tagged `norush-smoke`. The MQTT test collects events for about 30 seconds. It does not prove hardware or radio communication.

## Optional history

The history loader inserts simulated readings straight into the database. It is separate from the ingestion tests and does not prove reception over MQTT or HTTP.

```powershell
npm run backfill --workspace=backend
```

By default it loads 90 days, which can mean hundreds of thousands of readings. It is not needed for the basic walkthrough. Set `DAYS` for less, and check its options before running it on a database already in use.

## Stop and recover

- Stop the API, console and simulator with Ctrl+C in their terminals.
- `npm run docker:down` stops the Compose services and keeps the volumes.
- Do not remove volumes or use `FORCE_SEED=1` to fix a presentation problem: both erase data.
- An overview without recent readings is a valid state when the simulator is stopped.
- If sign-in fails, check the API at `/health`, the seed and the environment settings.
- If a port is busy, find out which process and project hold it first. Do not kill unknown processes.
