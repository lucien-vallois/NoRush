#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { GatewayConnection } from "./modbus.js";
import { NoRushClient, CLIENT_VERSION } from "./norush.js";
import { ReadingBuffer } from "./buffer.js";
import { Runner } from "./runner.js";
import { GaugeState, interpret } from "./gauge.js";
import { decodeFloat32, decodeInt16 } from "./decode.js";

const USAGE = `${CLIENT_VERSION} — reads tank gauges over Modbus and sends them to NoRush

Usage:
  norush-edge run   [--config edge.config.json]          poll forever and send readings
  norush-edge check [--config edge.config.json] [--send] read every gauge once and show what would be sent
  norush-edge read  [--config edge.config.json] --unit <slaveId> (--register <4xxxx|3xxxx> | --address <n> [--input]) [--count <n>]
                                                         raw register dump for troubleshooting

Options:
  --config <file>   configuration file (default: edge.config.json)
  --send            with check: send one reading per gauge to the server
  --verbose         print debug details
`;

const LEVEL_RANK = { debug: 0, info: 1, warn: 2, error: 3 };

function makeLogger(verbose) {
  const min = verbose ? 0 : 1;
  return (level, message) => {
    if (LEVEL_RANK[level] < min) return;
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}`;
    (level === "error" || level === "warn" ? console.error : console.log)(line);
  };
}

async function main() {
  const { values: opts, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string", default: "edge.config.json" },
      send: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      unit: { type: "string" },
      register: { type: "string" },
      address: { type: "string" },
      input: { type: "boolean", default: false },
      count: { type: "string", default: "2" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const command = positionals[0];
  if (opts.help || !command) {
    console.log(USAGE);
    return opts.help ? 0 : 1;
  }
  const log = makeLogger(opts.verbose);
  const config = loadConfig(opts.config);
  const gateway = new GatewayConnection(config.gateway, log);

  if (command === "read") return readCommand(config, gateway, opts);
  if (command === "check") return checkCommand(config, gateway, opts, log);
  if (command === "run") return runCommand(config, gateway, log);
  console.error(`unknown command "${command}"\n\n${USAGE}`);
  return 1;
}

async function runCommand(config, gateway, log) {
  const client = new NoRushClient(config.norush);
  const buffer = new ReadingBuffer(config.buffer.path, { maxEntries: config.buffer.maxEntries, log });
  const runner = new Runner({ config, gateway, client, buffer, log });
  const shutdown = async (signal) => {
    log("info", `${signal} received, stopping`);
    await runner.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  await runner.start();
  return new Promise(() => {}); // segue rodando até um sinal
}

async function checkCommand(config, gateway, opts, log) {
  const client = new NoRushClient(config.norush);
  let failures = 0;
  console.log(`gateway: ${gateway.describe()}`);
  console.log(`server:  ${config.norush.url}\n`);
  for (const gauge of config.gauges) {
    console.log(`== ${gauge.sensorId}  (Slave ID ${gauge.unitId}, profile ${gauge.profile.id})`);
    let registers;
    try {
      registers = await gateway.readBlocks(gauge.unitId, gauge.profile);
    } catch (err) {
      console.log(`   READ FAILED: ${err.message}\n`);
      failures++;
      continue;
    }
    const state = new GaugeState(gauge, gauge.profile);
    const result = interpret(state, registers);
    console.log(`   word order: ${state.wordOrder ?? "unknown"}`);
    for (const [name, v] of Object.entries(result.values ?? {})) {
      const unit = gauge.profile.values[name].unit;
      const extra = unit === "in" && Number.isFinite(v) ? `  (${(v / 12).toFixed(3)} ft, ${(v * 0.0254).toFixed(4)} m)` : "";
      console.log(`   ${name.padEnd(18)} ${Number.isFinite(v) ? +v.toFixed(4) : v}${unit ? " " + unit : ""}${extra}`);
    }
    if (result.status !== "ok") {
      console.log(`   STATUS: ${result.status} — ${result.detail}\n`);
      failures++;
      continue;
    }
    console.log(`   would send: ${JSON.stringify(result.sample)}`);
    if (opts.send) {
      const res = await client.sendReading(gauge, result.sample, new Date().toISOString());
      console.log(res.ok ? "   SENT: accepted by the server" : `   SEND FAILED: ${res.reason}`);
      if (!res.ok) failures++;
    }
    console.log("");
  }
  await gateway.close();
  log("info", failures ? `${failures} problem(s) found` : "all gauges OK");
  return failures ? 2 : 0;
}

async function readCommand(config, gateway, opts) {
  const unit = Number(opts.unit);
  if (!Number.isInteger(unit) || unit < 1 || unit > 247) throw new Error("--unit <1-247> is required");
  let fn = opts.input ? "input" : "holding";
  let address;
  if (opts.register) {
    const n = Number(opts.register);
    if (n >= 40001 && n <= 49999) [fn, address] = ["holding", n - 40001];
    else if (n >= 30001 && n <= 39999) [fn, address] = ["input", n - 30001];
    else throw new Error("--register must be a 3xxxx or 4xxxx register number");
  } else if (opts.address != null) {
    address = Number(opts.address);
  } else {
    throw new Error("--register or --address is required");
  }
  const count = Number(opts.count);
  const data = await gateway.readRaw(unit, fn, address, count);
  console.log(`unit ${unit}, ${fn} registers from address ${address} (register ${(fn === "input" ? 30001 : 40001) + address})`);
  console.log("address  register  hex     uint16  int16   float32 ABCD     float32 CDAB");
  data.forEach((v, i) => {
    const a = address + i;
    const pair = i + 1 < data.length
      ? [decodeFloat32(v, data[i + 1], "ABCD"), decodeFloat32(v, data[i + 1], "CDAB")].map((f) => (Number.isFinite(f) ? f.toPrecision(7) : String(f)).padStart(15))
      : ["", ""];
    console.log(
      `${String(a).padStart(7)}  ${String((fn === "input" ? 30001 : 40001) + a).padStart(8)}  0x${v.toString(16).padStart(4, "0")}  ${String(v).padStart(6)}  ${String(decodeInt16(v)).padStart(6)}  ${pair[0]}  ${pair[1]}`,
    );
  });
  await gateway.close();
  return 0;
}

main().then(
  (code) => {
    if (typeof code === "number") process.exit(code);
  },
  (err) => {
    console.error(err.message);
    process.exit(1);
  },
);
