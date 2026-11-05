# Production install

How to run the NoRush server for real: empty database, no demo accounts, real gauges through [`norush-edge`](../edge/README.md).

## What runs where

| Part | Where | Notes |
| --- | --- | --- |
| PostgreSQL with TimescaleDB | Server (or a managed database with the TimescaleDB extension) | Holds tanks, gauges, readings and alerts. |
| NoRush API (`backend`) | Server, behind HTTPS | `NODE_ENV=production`. Applies database migrations on start. |
| NoRush console (`frontend`) | Same server, static files | Build with `VITE_API_URL` pointing to the API. |
| `norush-edge` | A PC at each pad | Reads the gauge gateway and sends readings over HTTPS. |
| MQTT broker | Optional | Only needed for devices that publish MQTT themselves. `norush-edge` uses HTTPS. |

Every `v*` tag publishes container images to GHCR: `ghcr.io/lucien-vallois/norush-server` (API) and `ghcr.io/lucien-vallois/norush-console` (console), tagged with the version and `latest`. The instructions below assume the repository; adapt paths if you run those images instead.

## 1. Environment

Create the API's `.env` from `env.example` and set at least:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_SSL` | Your database. Use a strong password. |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Two **different** random secrets of 32+ characters. The API refuses to start with short, default or repeated secrets. |
| `IOT_AUTH_MODE` | `device`: each gauge sends its own credential. Use `hybrid` only while moving off the shared demo key. |
| `CORS_ORIGIN` | The console's address, e.g. `https://norush.example.com`. |
| `PORT` | 3000 (behind the reverse proxy). |

To generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 2. Database schema

On start, in production, the API **applies pending migrations** (`backend/src/migrations`). It then sets up TimescaleDB: the hypertable, the 5-minute and 1-hour aggregates, compression and retention.

**Do not run the seed in production.** It creates demo accounts with known passwords.

To run the migrations by hand, from the repository:

```bash
npm run migration:run --workspace=backend
```

In the production image, from `/app/backend`:

```bash
node ../node_modules/typeorm/cli.js migration:run -d dist/data-source.js
```

**A database created earlier in development mode** (`synchronize`) already has the tables. Record the initial migration as applied, without running it:

```bash
npm run migration:run --workspace=backend -- --fake
```

When the entities change, generate a new migration against a database that is up to date:

```bash
npm run migration:generate --workspace=backend -- src/migrations/<Name>
```

## 3. First administrator

The password comes from an environment variable so it does not stay in the shell history. It needs at least 12 characters.

From the repository:

```bash
NORUSH_ADMIN_PASSWORD='<password>' npm run admin:create --workspace=backend -- --email ops@yourcompany.com --name "Ops Lead"
```

In the production image:

```bash
NORUSH_ADMIN_PASSWORD='<password>' node dist/scripts/create-admin.js --email ops@yourcompany.com --name "Ops Lead"
```

`--reset` sets a new password on an existing user and makes it admin. Create the other users from the API (`POST /auth/users`, admin only) with the roles `operator` or `maintenance`.

## 4. HTTPS

Put the API and the console behind a reverse proxy with a certificate. Example with Caddy:

```
norush.example.com {
    handle /api/* {
        uri strip_prefix /api
        reverse_proxy localhost:3000
    }
    handle /socket.io/* {
        reverse_proxy localhost:3000
    }
    handle {
        root * /srv/norush/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

Build the console for that address. The API base and the live-updates channel (Socket.IO, served at `/socket.io/`) are set separately:

```bash
VITE_API_URL=https://norush.example.com/api VITE_WS_URL=https://norush.example.com npm run build --workspace=frontend
```

In `norush-edge`, set `norush.url` to the API address (`https://norush.example.com/api` in this example).

## 5. Tanks, gauges and the pad

1. Sign in as admin.
2. Register the tanks (dimensions, limits, gauge chart).
3. Register one gauge per tank and save each credential.
4. Install and commission `norush-edge` at the pad, following [its manual](../edge/README.md).

## 6. Operation

- **Backups:** daily `pg_dump` to another machine or bucket, and a tested restore.
- **Updates:** stop the API, update the code or image, start it. Migrations run on start.
- **Health:** `GET /health` reports the API, database and MQTT.
- **Online window:** a gauge counts as transmitting when it sent a reading or heartbeat in the last 5 minutes. `norush-edge` sends heartbeats between check-ins.
