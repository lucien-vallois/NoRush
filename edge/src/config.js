import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadProfile } from "./profiles.js";
import { WORD_ORDERS } from "./decode.js";

const SENSOR_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;

/**
 * Lê e valida o arquivo de configuração do adaptador. Erros saem com o
 * caminho do campo, para o instalador corrigir sem adivinhar.
 */
export function loadConfig(path, env = process.env) {
  const file = resolve(path);
  if (!existsSync(file)) throw new Error(`config file not found: ${file}`);
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    throw new Error(`config ${file} is not valid JSON: ${err.message}`);
  }
  return normalizeConfig(cfg, dirname(file), env);
}

export function normalizeConfig(cfg, baseDir, env = process.env) {
  const errors = [];
  const err = (field, msg) => errors.push(`${field}: ${msg}`);

  // Servidor NoRush
  const norush = cfg.norush ?? {};
  let url = norush.url;
  if (!url) err("norush.url", "required (e.g. https://norush.example.com)");
  else {
    try {
      const u = new URL(url);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) {
        err("norush.url", "must be https:// (plain http is only allowed for localhost)");
      }
    } catch {
      err("norush.url", `invalid URL ${url}`);
    }
  }

  // Gateway
  const gw = cfg.gateway ?? {};
  if (!["tcp", "rtu", "rtu-over-tcp"].includes(gw.type)) {
    err("gateway.type", 'must be "tcp", "rtu" or "rtu-over-tcp"');
  } else if (gw.type === "rtu") {
    if (!gw.path) err("gateway.path", "serial port required (e.g. COM3 or /dev/ttyUSB0)");
    if (gw.parity && !["none", "even", "odd"].includes(gw.parity)) {
      err("gateway.parity", 'must be "none", "even" or "odd"');
    }
  } else if (!gw.host) {
    err("gateway.host", "required (IP address of the gateway)");
  }

  const pollIntervalSeconds = cfg.pollIntervalSeconds ?? 60;
  if (!(pollIntervalSeconds >= 5)) err("pollIntervalSeconds", "must be at least 5");

  // Hastes
  const gauges = [];
  const seenIds = new Set();
  const seenUnits = new Set();
  if (!Array.isArray(cfg.gauges) || cfg.gauges.length === 0) {
    err("gauges", "list at least one gauge");
  }
  (cfg.gauges ?? []).forEach((g, i) => {
    const f = (k) => `gauges[${i}].${k}`;
    if (!g.sensorId || !SENSOR_ID.test(g.sensorId)) {
      err(f("sensorId"), "the device ID registered in NoRush (3-64 letters, numbers, - or _)");
    } else if (seenIds.has(g.sensorId)) err(f("sensorId"), "repeated");
    seenIds.add(g.sensorId);

    if (!Number.isInteger(g.unitId) || g.unitId < 1 || g.unitId > 247) {
      err(f("unitId"), "Modbus Slave ID of this gauge at the gateway (1-247)");
    } else if (seenUnits.has(g.unitId)) err(f("unitId"), "two gauges with the same Slave ID");
    seenUnits.add(g.unitId);

    let token = g.token;
    if (!token && g.tokenEnv) token = env[g.tokenEnv];
    if (!token && g.tokenFile) {
      const p = resolve(baseDir, g.tokenFile);
      if (existsSync(p)) token = readFileSync(p, "utf8").trim();
      else err(f("tokenFile"), `file not found: ${p}`);
    }
    if (!token) err(f("token"), "device credential missing (token, tokenEnv or tokenFile)");

    let profile = null;
    try {
      profile = loadProfile(g.profile ?? "signalfire-sentinel-float-stick", baseDir);
    } catch (e) {
      err(f("profile"), e.message);
    }

    if (g.wordOrder && g.wordOrder !== "auto" && !WORD_ORDERS.includes(g.wordOrder)) {
      err(f("wordOrder"), `must be "auto" or one of ${WORD_ORDERS.join(", ")}`);
    }
    if (g.floats != null && ![1, 2].includes(g.floats)) err(f("floats"), "1 or 2");
    if (g.battery) {
      const { emptyMv, fullMv } = g.battery;
      if (!(Number.isFinite(emptyMv) && Number.isFinite(fullMv) && fullMv > emptyMv)) {
        err(f("battery"), "needs emptyMv < fullMv (millivolts)");
      }
    }

    gauges.push({
      sensorId: g.sensorId,
      unitId: g.unitId,
      token,
      profile,
      floats: g.floats ?? 2,
      wordOrder: g.wordOrder ?? "auto",
      battery: g.battery ?? null,
    });
  });

  if (errors.length) {
    const e = new Error("invalid configuration:\n  - " + errors.join("\n  - "));
    e.configErrors = errors;
    throw e;
  }

  return {
    norush: { url, timeoutMs: norush.timeoutMs ?? 10000 },
    gateway: { ...gw },
    pollIntervalSeconds,
    heartbeatSeconds: cfg.heartbeatSeconds ?? pollIntervalSeconds,
    forceReadingSeconds: cfg.forceReadingSeconds ?? 600,
    buffer: {
      path: resolve(baseDir, cfg.buffer?.path ?? "norush-edge-buffer.jsonl"),
      maxEntries: cfg.buffer?.maxEntries ?? 20000,
    },
    gauges,
  };
}
