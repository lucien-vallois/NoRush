import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NoRushClient } from "../src/norush.js";
import { ReadingBuffer } from "../src/buffer.js";
import { normalizeConfig } from "../src/config.js";

/** Servidor HTTP local que responde como a API do NoRush. */
async function fakeApi(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const entry = { url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null };
      requests.push(entry);
      const [status, json] = handler(entry);
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, requests, close: () => new Promise((r) => server.close(r)) };
}

const gauge = { sensorId: "FS-24117", token: "nrk_test_token" };
const sample = {
  level: 3.048,
  oilWaterInterface: { oilLevel: 0.9144, waterLevel: 2.1336, interfaceLevel: 2.1336 },
  metadata: { temperature: 18.5 },
};

test("reading goes to /iot/sensors/data with the device token header", async () => {
  const api = await fakeApi(() => [200, { sensorId: "FS-24117", received: true, processed: true }]);
  const client = new NoRushClient({ url: api.url });
  const res = await client.sendReading(gauge, sample, "2026-11-04T10:00:00.000Z");
  assert.deepEqual(res, { ok: true });
  const [req] = api.requests;
  assert.equal(req.url, "/iot/sensors/data");
  assert.equal(req.headers["x-device-token"], "nrk_test_token");
  assert.equal(req.body.authToken, undefined); // segredo só no header
  assert.equal(req.body.level, 3.048);
  assert.equal(req.body.timestamp, "2026-11-04T10:00:00.000Z");
  assert.deepEqual(req.body.oilWaterInterface, sample.oilWaterInterface);
  await api.close();
});

test("a refused reading is final; 5xx and a dead server are retried", async () => {
  const api = await fakeApi((req) =>
    req.body.level > 4
      ? [503, { message: "down" }]
      : [200, { processed: false, errors: ["Autenticação recusada (invalidDeviceCredential)"] }],
  );
  const client = new NoRushClient({ url: api.url });
  const refused = await client.sendReading(gauge, sample, new Date().toISOString());
  assert.equal(refused.ok, false);
  assert.equal(refused.retry, false);
  assert.match(refused.reason, /invalidDeviceCredential/);
  const down = await client.sendReading(gauge, { ...sample, level: 5 }, new Date().toISOString());
  assert.equal(down.retry, true);
  await api.close();
  const dead = await new NoRushClient({ url: api.url, timeoutMs: 2000 }).sendReading(gauge, sample, new Date().toISOString());
  assert.equal(dead.retry, true);
});

test("heartbeat goes to /iot/sensors/heartbeat", async () => {
  const api = await fakeApi(() => [200, { received: true }]);
  const res = await new NoRushClient({ url: api.url }).sendHeartbeat(gauge, { signalStrength: -71 });
  assert.equal(res.ok, true);
  assert.equal(api.requests[0].url, "/iot/sensors/heartbeat");
  assert.equal(api.requests[0].body.signalStrength, -71);
  await api.close();
});

test("buffer survives a restart, tolerates a torn line and caps its size", () => {
  const dir = mkdtempSync(join(tmpdir(), "norush-edge-"));
  const path = join(dir, "buffer.jsonl");
  const a = new ReadingBuffer(path);
  a.push({ sensorId: "A", timestamp: "t1" });
  a.push({ sensorId: "A", timestamp: "t2" });
  appendFileSync(path, '{"sensorId":"A","timest'); // queda de energia no meio da escrita
  const b = new ReadingBuffer(path);
  assert.equal(b.size, 2);
  b.shift(1);
  assert.equal(new ReadingBuffer(path).peek(1)[0].timestamp, "t2");
  const logs = [];
  const c = new ReadingBuffer(join(dir, "small.jsonl"), { maxEntries: 2, log: (l, m) => logs.push(m) });
  ["x", "y", "z"].forEach((t) => c.push({ timestamp: t }));
  assert.deepEqual(c.peek(5).map((e) => e.timestamp), ["y", "z"]);
  assert.match(logs[0], /dropped 1/);
  assert.equal(readFileSync(join(dir, "small.jsonl"), "utf8").trim().split("\n").length, 2);
});

test("config: tokens from env or file, https required off localhost, errors name the field", () => {
  const dir = mkdtempSync(join(tmpdir(), "norush-edge-cfg-"));
  writeFileSync(join(dir, "fs2.token"), "nrk_from_file\n");
  const cfg = normalizeConfig(
    {
      norush: { url: "https://norush.example.com" },
      gateway: { type: "tcp", host: "192.168.1.50" },
      gauges: [
        { sensorId: "FS-1", unitId: 11, tokenEnv: "TOKEN_FS1" },
        { sensorId: "FS-2", unitId: 12, tokenFile: "fs2.token", floats: 1 },
      ],
    },
    dir,
    { TOKEN_FS1: "nrk_from_env" },
  );
  assert.equal(cfg.gauges[0].token, "nrk_from_env");
  assert.equal(cfg.gauges[1].token, "nrk_from_file");
  assert.equal(cfg.gauges[0].profile.id, "signalfire-sentinel-float-stick");
  assert.equal(cfg.pollIntervalSeconds, 60);

  assert.throws(
    () =>
      normalizeConfig(
        {
          norush: { url: "http://norush.example.com" },
          gateway: { type: "rtu" },
          gauges: [
            { sensorId: "FS-1", unitId: 11, token: "a" },
            { sensorId: "FS-1", unitId: 11 },
          ],
        },
        dir,
        {},
      ),
    (e) => {
      const msg = e.message;
      return (
        /norush\.url: must be https/.test(msg) &&
        /gateway\.path/.test(msg) &&
        /gauges\[1\]\.sensorId: repeated/.test(msg) &&
        /gauges\[1\]\.unitId: two gauges/.test(msg) &&
        /gauges\[1\]\.token: device credential missing/.test(msg)
      );
    },
  );
});
