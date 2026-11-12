import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { io } from "socket.io-client";

const base = new URL(process.env.SMOKE_API_URL || "http://localhost:3000");
assert(
  ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
  "Run smoke tests only against the local demonstration database.",
);
const passed = [];
async function check(name, action) {
  await action();
  passed.push(name);
  console.log(`PASS ${name}`);
}
async function request(
  path,
  { token, body, status = 200, method = body ? "POST" : "GET" } = {},
) {
  const response = await fetch(new URL(path, base), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(
    response.status,
    status,
    `${method} ${path}: expected ${status}, got ${response.status}`,
  );
  return response.headers.get("content-type")?.includes("json")
    ? response.json()
    : response.text();
}
async function socketConnection(token, reject = false) {
  const socket = io(base.origin, {
    auth: token ? { token } : {},
    autoConnect: false,
    reconnection: false,
    timeout: 5000,
  });
  await new Promise((resolve, fail) => {
    const timer = setTimeout(() => {
      socket.disconnect();
      fail(new Error("WebSocket connection timed out"));
    }, 6000);
    socket.once("connect", () => {
      clearTimeout(timer);
      if (reject) {
        socket.disconnect();
        fail(new Error("Anonymous socket was accepted"));
      } else resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timer);
      reject ? resolve() : fail(error);
    });
    socket.connect();
  });
  return socket;
}

let ready = false;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(new URL("/health", base), {
      signal: AbortSignal.timeout(1500),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {}
  await delay(500);
}
assert(
  ready,
  "API did not become ready. Start the backend and infrastructure first.",
);
let operator;
let tanks;
let sensor;
let socket;
let testAlert;
try {
  await check("measured API/database health and security headers", async () => {
    const response = await fetch(new URL("/health", base));
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    const health = await response.json();
    assert.equal(health.components.database, "up");
    assert(["up", "down", "disabled"].includes(health.components.mqtt));
  });
  await check("anonymous API request is denied", () =>
    request("/tanks", { status: 401 }),
  );
  await check("malformed login is rejected at the HTTP boundary", () =>
    request("/auth/login", {
      body: { email: "invalid", password: 123 },
      status: 400,
    }),
  );
  await check("wrong password returns 401", () =>
    request("/auth/login", {
      body: { email: "operador@flowback.com", password: "incorrect-password" },
      status: 401,
    }),
  );
  await check("operator login returns a public profile", async () => {
    operator = await request("/auth/login", {
      body: {
        email: process.env.DEMO_EMAIL || "operador@flowback.com",
        password: process.env.DEMO_PASSWORD || "operador123",
      },
    });
    assert.equal(operator.user.role, "operator");
    assert(!JSON.stringify(operator).includes("passwordHash"));
    assert(operator.expiresIn > 0);
  });
  const token = operator.accessToken;
  await check("tank dimensions and capacities are available", async () => {
    tanks = await request("/tanks", { token });
    assert(tanks.length > 0);
    assert(
      tanks.every(
        (tank) => tank.dimensions.height > 0 && tank.dimensions.volume > 0,
      ),
    );
  });
  await check(
    "sensor overview and online denominator are consistent",
    async () => {
      const stats = await request("/sensors/dashboard", { token });
      assert(stats.overview.online <= stats.overview.active);
      const sensors = await request("/sensors", { token });
      sensor = sensors.find(
        (item) => item.status === "active" && item.type === "magnetostrictive",
      );
      assert(sensor, "An active level sensor is required; run the seed first.");
    },
  );
  await check(
    "forecast freshness is explicit and stale ETAs are suspended",
    async () => {
      const forecasts = await request("/predictions", { token });
      for (const forecast of forecasts) {
        assert.equal(typeof forecast.dataFresh, "boolean");
        if (!forecast.dataFresh) {
          assert.equal(forecast.currentLevel, null);
          assert.equal(forecast.etaOverflowHours, null);
        }
      }
    },
  );
  await check("paginated alert response has numeric counts", async () => {
    const result = await request("/alerts?limit=2&page=1", { token });
    assert.equal(result.limit, 2);
    assert.equal(result.page, 1);
    assert(Number.isInteger(result.total));
    assert(result.alerts.length <= 2);
    assert(!JSON.stringify(result).includes("passwordHash"));
  });
  await check("invalid pagination is rejected", () =>
    request("/alerts?limit=0", { token, status: 400 }),
  );
  await check("operator cannot access administrator users", () =>
    request("/auth/users", { token, status: 403 }),
  );
  await check("refresh issues a working access token", async () => {
    const result = await request("/auth/refresh", {
      body: { refreshToken: operator.refreshToken },
    });
    const profile = await request("/auth/profile", {
      token: result.accessToken,
    });
    assert.equal(profile.id, operator.user.id);
  });
  await check("refresh token cannot be used as an access token", () =>
    request("/auth/profile", { token: operator.refreshToken, status: 401 }),
  );
  await check("anonymous realtime handshake is rejected", async () => {
    (await socketConnection(undefined, true)).disconnect();
  });
  await check("authenticated realtime handshake succeeds", async () => {
    socket = await socketConnection(token);
  });
  await check(
    "HTTP telemetry is persisted and delivered over authenticated WebSocket",
    async () => {
      const event = new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("No matching reading event")),
          8000,
        );
        const listener = (message) => {
          if (
            message.payload?.sensorId === sensor.sensorId &&
            message.payload?.level === 1.25
          ) {
            clearTimeout(timer);
            socket.off("reading", listener);
            resolve(message.payload);
          }
        };
        socket.on("reading", listener);
      });
      const result = await request("/iot/sensors/data", {
        body: {
          sensorId: sensor.sensorId,
          level: 1.25,
          timestamp: new Date().toISOString(),
          authToken: process.env.IOT_INGEST_KEY,
          metadata: { rawData: { source: "norush-smoke", simulated: true } },
        },
      });
      assert.equal(result.processed, true, result.errors?.join(", "));
      assert.equal((await event).level, 1.25);
      const rows = await request(
        `/readings/sensor/${sensor.id}/latest?limit=1`,
        { token },
      );
      assert.equal(Number(rows[0].level), 1.25);
      assert(Number(rows[0].volume) > 0);
    },
  );
  await check(
    "out-of-range telemetry is rejected without persistence",
    async () => {
      const before = await request(
        `/readings/sensor/${sensor.id}/latest?limit=1`,
        { token },
      );
      const result = await request("/iot/sensors/data", {
        body: {
          sensorId: sensor.sensorId,
          level: 999,
          authToken: process.env.IOT_INGEST_KEY,
        },
      });
      assert.equal(result.processed, false);
      const after = await request(
        `/readings/sensor/${sensor.id}/latest?limit=1`,
        { token },
      );
      assert.equal(after[0].id, before[0].id);
    },
  );
  await check(
    "continuous aggregate includes the latest telemetry bucket",
    async () => {
      const from = new Date(Date.now() - 3600000).toISOString();
      const result = await request(
        `/readings/timeseries?sensorId=${sensor.id}&bucket=5m&from=${encodeURIComponent(from)}`,
        { token },
      );
      assert(
        result.series.some(
          (row) =>
            Date.now() - new Date(row.bucket).getTime() < 10 * 60000 &&
            Number.isFinite(row.avg_level),
        ),
        "Latest readings are missing from the aggregate",
      );
    },
  );
  await check(
    "synthetic alert creation, recognition and resolution preserve actor and notes",
    async () => {
      const admin = await request("/auth/login", {
        body: { email: "admin@flowback.com", password: "admin123" },
      });
      testAlert = await request("/alerts", {
        token: admin.accessToken,
        status: 201,
        body: {
          type: "sensor_error",
          severity: "low",
          title: "Verificação do fluxo NoRush",
          message:
            "Ocorrência sintética do teste de integração local. Nenhum incidente de campo.",
          tankId: sensor.tankId,
          sensorId: sensor.id,
          metadata: { source: "norush-smoke", simulated: true },
        },
      });
      const acknowledged = await request(
        `/alerts/${testAlert.id}/acknowledge`,
        { token, body: {} },
      );
      assert.equal(acknowledged.status, "acknowledged");
      assert.equal(acknowledged.acknowledgedBy.id, operator.user.id);
      const notes =
        "Teste de integração concluído no ambiente demonstrativo. Sem ação em equipamento.";
      const resolved = await request(`/alerts/${testAlert.id}/resolve`, {
        token,
        body: { resolutionNotes: notes },
      });
      assert.equal(resolved.status, "resolved");
      assert.equal(resolved.resolutionNotes, notes);
      assert.equal(resolved.resolvedBy.id, operator.user.id);
      assert(!JSON.stringify(resolved).includes("passwordHash"));
      await request(`/alerts/${testAlert.id}/resolve`, {
        token,
        body: { resolutionNotes: notes },
        status: 400,
      });
    },
  );
  await check(
    "bulk acknowledge and resolve reach their routes and act on every alert",
    async () => {
      const admin = await request("/auth/login", {
        body: { email: "admin@flowback.com", password: "admin123" },
      });
      const created = await Promise.all(
        [1, 2].map((n) =>
          request("/alerts", {
            token: admin.accessToken,
            status: 201,
            body: {
              type: "sensor_error",
              severity: "low",
              title: `Bulk smoke ${n}`,
              message:
                "Ocorrência sintética do teste de integração local. Nenhum incidente de campo.",
              tankId: sensor.tankId,
              metadata: { source: "norush-smoke", simulated: true },
            },
          }),
        ),
      );
      // Regressão: ":id/acknowledge" era casado antes de "bulk/acknowledge"
      // e essas rotas devolviam 404 de alerta inexistente
      const acknowledged = await request("/alerts/bulk/acknowledge", {
        token,
        status: 200,
        body: { alertIds: created.map((alert) => alert.id) },
      });
      assert(acknowledged.every((alert) => alert.status === "acknowledged"));
      const resolved = await request("/alerts/bulk/resolve", {
        token,
        status: 200,
        body: {
          alertIds: created.map((alert) => alert.id),
          resolutionNotes: "Bulk smoke resolvido pelo teste local.",
        },
      });
      assert(resolved.every((alert) => alert.status === "resolved"));
    },
  );
  await check(
    "logout revokes that session only: its tokens die, other sessions stay",
    async () => {
      const credentials = {
        email: "operador@flowback.com",
        password: "operador123",
      };
      const fresh = await request("/auth/login", { body: credentials });
      const other = await request("/auth/login", { body: credentials });
      await request("/auth/logout", {
        token: fresh.accessToken,
        status: 200,
        body: {},
      });
      await request("/auth/profile", {
        token: fresh.accessToken,
        status: 401,
      });
      await request("/auth/refresh", {
        body: { refreshToken: fresh.refreshToken },
        status: 401,
      });
      // Shared demo accounts: one visitor signing out must not end the others
      await request("/auth/profile", { token: other.accessToken, status: 200 });
      await request("/auth/logout", {
        token: other.accessToken,
        status: 200,
        body: {},
      });
    },
  );
  console.log(
    JSON.stringify(
      {
        result: "PASS",
        checks: passed.length,
        utc: new Date().toISOString(),
        api: base.origin,
        data: "local simulated telemetry",
        retainedSyntheticAlert: testAlert?.id,
      },
      null,
      2,
    ),
  );
} finally {
  socket?.disconnect();
}
