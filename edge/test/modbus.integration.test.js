/**
 * Integração no nível do protocolo: o cliente Modbus TCP real do adaptador
 * contra um servidor Modbus TCP (modbus-serial ServerTCP) que expõe os
 * registradores exatamente como a tabela do manual do Float Stick. Este
 * servidor existe só no teste; em campo, quem responde é o gateway.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ModbusRTU from "modbus-serial";
import { GatewayConnection } from "../src/modbus.js";
import { loadProfile } from "../src/profiles.js";
import { NoRushClient } from "../src/norush.js";
import { ReadingBuffer } from "../src/buffer.js";
import { Runner } from "../src/runner.js";
import { floatStickRegisters } from "./helpers.js";

const profile = loadProfile("signalfire-sentinel-float-stick");

async function gatewayFixture(nodes) {
  const port = 15000 + Math.floor(Math.random() * 20000);
  const vector = {
    getMultipleHoldingRegisters(addr, length, unitID, cb) {
      const regs = nodes.get(unitID);
      const out = [];
      for (let i = 0; i < length; i++) {
        const v = regs?.get(addr + i);
        // gateway com buffer: endereço/nó sem dado → exceção 2 (illegal data address)
        if (v === undefined) return cb({ modbusErrorCode: 0x02 });
        out.push(v);
      }
      cb(null, out);
    },
    getHoldingRegister(addr, unitID, cb) {
      const v = nodes.get(unitID)?.get(addr);
      if (v === undefined) return cb({ modbusErrorCode: 0x02 });
      cb(null, v);
    },
  };
  const server = new ModbusRTU.ServerTCP(vector, { host: "127.0.0.1", port, unitID: 0 });
  await new Promise((r) => server.on("initialized", r));
  return { port, close: () => new Promise((r) => server.close(r)) };
}

async function captureApi() {
  const posts = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      posts.push({ url: req.url, token: req.headers["x-device-token"], body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(req.url.endsWith("heartbeat") ? { received: true } : { processed: true }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, posts, close: () => new Promise((r) => server.close(r)) };
}

test("reads two gauges over Modbus TCP and posts their readings", async (t) => {
  const nodes = new Map([
    [11, floatStickRegisters({ product: 120, iface: 84, order: "CDAB", unitId: 11 })],
    // nó 12 com gateway sem o bloco de status (firmware antigo)
    [12, floatStickRegisters({ product: 60, iface: 10, order: "CDAB", status: false, unitId: 12 })],
  ]);
  const gw = await gatewayFixture(nodes);
  const api = await captureApi();
  const logs = [];
  const config = {
    pollIntervalSeconds: 60,
    heartbeatSeconds: 60,
    forceReadingSeconds: 600,
    gauges: [
      { sensorId: "FS-24117", unitId: 11, token: "nrk_a", profile, floats: 2, wordOrder: "auto" },
      { sensorId: "FS-24118", unitId: 12, token: "nrk_b", profile, floats: 2, wordOrder: "auto" },
      // nó 13 nunca fez check-in: o gateway responde com exceção
      { sensorId: "FS-24119", unitId: 13, token: "nrk_c", profile, floats: 2, wordOrder: "auto" },
    ],
  };
  const gateway = new GatewayConnection({ type: "tcp", host: "127.0.0.1", port: gw.port, timeoutMs: 2000 });
  const buffer = new ReadingBuffer(join(mkdtempSync(join(tmpdir(), "edge-int-")), "b.jsonl"));
  const runner = new Runner({
    config,
    gateway,
    client: new NoRushClient({ url: api.url }),
    buffer,
    log: (level, msg) => logs.push(`${level} ${msg}`),
  });
  t.after(async () => {
    await runner.stop();
    await gw.close();
    await api.close();
  });

  await runner.cycle();
  const readings = api.posts.filter((p) => p.url === "/iot/sensors/data");
  assert.equal(readings.length, 2);
  const a = readings.find((p) => p.body.sensorId === "FS-24117");
  assert.equal(a.token, "nrk_a");
  assert.equal(a.body.level, 3.048);
  assert.equal(a.body.oilWaterInterface.waterLevel, 2.1336);
  assert.equal(a.body.metadata.rawData.wordOrder, "CDAB");
  const b = readings.find((p) => p.body.sensorId === "FS-24118");
  assert.equal(b.body.level, 1.524);
  assert.equal(b.body.metadata.signalStrength, undefined);
  assert.ok(logs.some((l) => /FS-24119 \(unit 13\).*illegal data address/.test(l)), logs.join("\n"));

  // segundo ciclo, mesmo buffer do gateway: sem leitura repetida
  await runner.cycle();
  assert.equal(api.posts.filter((p) => p.url === "/iot/sensors/data").length, 2);
});

test("server down: readings wait on disk and go out in order when it returns", async (t) => {
  const nodes = new Map([[11, floatStickRegisters({ product: 100, unitId: 11 })]]);
  const gw = await gatewayFixture(nodes);
  let up = false;
  const posts = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (!up) {
        res.writeHead(503).end("{}");
        return;
      }
      posts.push({ url: req.url, body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" }).end('{"processed":true,"received":true}');
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const config = {
    pollIntervalSeconds: 60,
    heartbeatSeconds: 60,
    forceReadingSeconds: 600,
    gauges: [{ sensorId: "FS-24117", unitId: 11, token: "nrk_a", profile, floats: 2, wordOrder: "auto" }],
  };
  const path = join(mkdtempSync(join(tmpdir(), "edge-buf-")), "b.jsonl");
  const gateway = new GatewayConnection({ type: "tcp", host: "127.0.0.1", port: gw.port, timeoutMs: 2000 });
  const runner = new Runner({ config, gateway, client: new NoRushClient({ url }), buffer: new ReadingBuffer(path), log: () => {} });
  t.after(async () => {
    await runner.stop();
    await gw.close();
    await new Promise((r) => server.close(r));
  });

  await runner.cycle(); // 100 in → buffer
  nodes.set(11, floatStickRegisters({ product: 101, unitId: 11 }));
  await runner.cycle(); // 101 in → buffer
  assert.equal(new ReadingBuffer(path).size, 2); // está no disco
  up = true;
  await runner.cycle(); // servidor voltou: entrega na ordem
  const readings = posts.filter((p) => p.url === "/iot/sensors/data");
  assert.deepEqual(readings.map((p) => p.body.level), [2.54, 2.5654]);
  // depois do reenvio, sem dado novo no gateway: heartbeat, não leitura repetida
  assert.equal(posts.at(-1).url, "/iot/sensors/heartbeat");
  assert.equal(new ReadingBuffer(path).size, 0);
});
