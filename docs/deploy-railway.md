# Hosted demo on Railway

How to publish a browsable NoRush demo: the console, the API, PostgreSQL and a
worker that keeps simulated gauges reporting. Visitors open the link, sign in
with the demo accounts and walk through tanks, gauges, readings, alerts and the
gauge report with live simulated data.

[Português](deploy-railway.pt-BR.md)

> This is a **demo** deployment: simulated gauges, demo accounts with
> published passwords, no MQTT broker. For a real installation see
> [Production install](production-install.md).

## Services

| Service | Role | Public URL |
| --- | --- | --- |
| `api` | NestJS API and Socket.IO | yes |
| `console` | React console, built by Vite and served by `vite preview` | yes |
| `simulator` | Worker with no port: sends simulated readings to the API until stopped | no |
| `Postgres` | Railway's PostgreSQL plugin | no (private network) |

`norush-edge` is **not** deployed: it runs on a small PC at the pad, next to the
gauges, with its own configuration. If Railway created a service for the
`edge` workspace, delete it (it crash-loops on
`config file not found: /app/edge/edge.config.json`).

All three app services build from the **repository root**, so `npm ci` installs
from the single lockfile and every build gets the same dependency versions.
Leave *Root Directory* empty and set the commands below.

## 1. Database

Add the **PostgreSQL** plugin. It exposes `DATABASE_URL` (and the `PG*`
variables), which the API reads when `DB_*` is not set. In production the API
runs its migrations on startup.

Railway's PostgreSQL has no TimescaleDB. The API then creates plain views with
the same columns as the 5-minute and 1-hour aggregates, so history charts and
forecasts work at demo scale, without compression or retention. The startup log
says so once; that warning is expected.

## 2. `api`

| Setting | Value |
| --- | --- |
| Build command | `npm run build --workspace=backend` |
| Start command | `npm run start --workspace=backend` |
| Healthcheck path | `/health` |

| Variable | Value | Notes |
| --- | --- | --- |
| `NODE_ENV` | `production` | Runs migrations, requires real secrets, disables the `/iot/test/*` routes |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Reference to the plugin |
| `JWT_SECRET` | 48+ random characters | Required: `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | another 48+ random characters | Required, different from `JWT_SECRET` |
| `IOT_INGEST_KEY` | random | Shared ingestion key, also given to the simulator |
| `IOT_AUTH_MODE` | `shared` | |
| `CORS_ORIGIN` | `https://<console>.up.railway.app` | Comma-separated if there is more than one |
| `DEMO_AUTO_SEED` | `false` | Production refuses to boot with automatic demo seeding; seed explicitly as described below |
| `DEMO_READ_ONLY` | `true` | Visitors share accounts: refuse setup changes (see below) |
| `MQTT_ENABLED` | `false` | No broker in this deployment; health shows MQTT as "disabled" |
| `RABBITMQ_ENABLED` | `false` | No broker; readings are stored either way |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | Skips a Chromium download the demo does not need |

Generate a public domain in *Settings → Networking*. The API listens on
Railway's `PORT`, and trusts one proxy hop automatically on Railway, so the
rate limit sees each visitor's IP.

### Read-only mode

With `DEMO_READ_ONLY=true` the API refuses every write (403, translated
message) except signing in and out, token refresh, device ingestion (so the
simulator keeps working) and acknowledging or resolving alerts. Setup actions
are hidden or disabled in the console, so visitors cannot delete tanks, revoke
gauge credentials or create users for the next visitor. Alerts remain
actionable, and a banner explains the restriction.

Signing out ends only the visitor's own session, so people sharing a demo
account do not sign each other out.

## 3. `console`

| Setting | Value |
| --- | --- |
| Build command | `npm run build --workspace=frontend` |
| Start command | `npm run start --workspace=frontend` |

| Variable | Value |
| --- | --- |
| `VITE_API_URL` | `https://<api>.up.railway.app` |
| `VITE_WS_URL` | `https://<api>.up.railway.app` |
| `PREVIEW_ALLOWED_HOSTS` | only for a custom domain, e.g. `demo.example.com` |

`VITE_*` values are compiled into the bundle: after changing them, redeploy.
They are public, so never put a secret there. `vite preview` answers only for
allowed hosts; `*.up.railway.app` is allowed by default.

The repository also has production images (`backend/Dockerfile`, and
`frontend/Dockerfile` with nginx) published to GHCR on each release, if you
prefer to deploy containers.

## 4. `simulator`

| Setting | Value |
| --- | --- |
| Build command | *(none)* |
| Start command | `node backend/test/iot-simulation.js http` |

| Variable | Value |
| --- | --- |
| `HTTP_URL` | `https://<api>.up.railway.app` |
| `IOT_INGEST_KEY` | same value as the API |
| `SIM_DURATION` | `0` (run until stopped) |
| `SIM_INTERVAL` | `5000` |
| `SIM_SPEED` | `60` |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` |

No public networking: the worker only makes outbound calls.

## 5. Demo data

Production never seeds demo data automatically and refuses to boot with
`DEMO_AUTO_SEED=true`. After the API has applied its migrations, explicitly run
this command once from a shell in the `api` service (`railway ssh`):

```bash
# Seed only an empty database
npm run seed:prod --workspace=backend
```

This creates six tanks (FK-01 to FK-06), one dual-float gauge per tank and two
accounts:

- `operador@flowback.com` / `operador123` (operator)
- `admin@flowback.com` / `admin123` (admin)

These passwords are public. Use them only with `DEMO_READ_ONLY=true`, and never
seed a real installation.

Optional, from the same shell:

```bash
# 14 days of history, so the charts and the gauge report are full on day one
DAYS=14 node backend/dist/scripts/backfill.js

# wipe and seed again
FORCE_SEED=1 npm run seed:prod --workspace=backend
```

## 6. Before sharing the link

1. `https://<api>.up.railway.app/health` answers `"status": "ok"` with MQTT `disabled`.
2. The console opens on the login page; *Fill demo credentials* signs in.
3. The dashboard shows the six tanks and the 24-hour chart starts moving.
4. Tank setup actions are hidden or disabled; acknowledging an alert works.
5. The browser console shows no CORS errors.
6. Try it in a private window, then add a *Live demo* section with the URL to
   the README.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `JWT_SECRET must contain a unique secret of at least 32 characters` | Secrets missing, equal to each other, or still a placeholder |
| `config file not found: /app/edge/edge.config.json` | A service is running the `edge` workspace; delete it |
| `Blocked request. This host is not allowed` on the console | Custom domain not in `PREVIEW_ALLOWED_HOSTS` |
| CORS error in the browser | `CORS_ORIGIN` on the API does not include the console URL |
| Empty charts | Simulator stopped, or its `IOT_INGEST_KEY` differs from the API's |
| `VITE_API_URL` changed but nothing changed | Build-time variable: redeploy the console |
| `nest: not found` or `vite: not found` while building | Dev dependencies were skipped at install; set `NPM_CONFIG_PRODUCTION=false` on that service |
| 403 when saving | Expected with `DEMO_READ_ONLY=true` |
| 429 Too Many Requests | 100 requests per minute per IP (10 sign-ins per minute) |
