import { readValue, toCelsius, toMeters, detectWordOrder } from "./decode.js";

/**
 * Converte os registradores de uma haste em uma amostra NoRush e decide o
 * que enviar. Estado por haste: ordem dos 32 bits detectada e o último
 * snapshot (para saber se houve check-in novo no gateway com buffer).
 */
export class GaugeState {
  constructor(gauge, profile) {
    this.gauge = gauge;
    this.profile = profile;
    this.wordOrder = gauge.wordOrder && gauge.wordOrder !== "auto" ? gauge.wordOrder : null;
    this.last = null; // { level, interface, temperature, minutesToTimeout, at }
    this.lastReadingSentAt = 0;
    this.lastHeartbeatAt = 0;
  }
}

const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const map0 = (profile) => profile.map;
const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * @returns {{
 *   status: "ok" | "sensorError" | "stale" | "wrongDevice" | "wordOrderUnknown",
 *   detail?: string,
 *   values?: Record<string, number>,
 *   sample?: object
 * }}
 */
export function interpret(state, registers) {
  const { profile, gauge } = state;

  if (!state.wordOrder) {
    const probe = profile.wordOrderProbe;
    if (probe) {
      state.wordOrder = detectWordOrder(
        registers,
        profile.values[probe.value],
        probe.min,
        probe.max,
      );
    } else {
      state.wordOrder = profile.defaultWordOrder ?? "ABCD";
    }
    if (!state.wordOrder) {
      return {
        status: "wordOrderUnknown",
        detail: `could not tell the 32-bit word order from "${probe.value}" (expected ${probe.min}-${probe.max}); set "wordOrder" for this gauge`,
      };
    }
  }

  // Valores de blocos opcionais que o gateway não respondeu ficam de fora
  const values = {};
  for (const [name, def] of Object.entries(profile.values)) {
    const width = def.type.endsWith("32") ? 2 : 1;
    let present = true;
    for (let i = 0; i < width; i++) present &&= registers.has(def.address + i);
    if (present) values[name] = readValue(registers, def, state.wordOrder);
  }
  if (values[map0(profile).level] === undefined) {
    return { status: "sensorError", values, detail: "level registers were not read" };
  }
  const map = profile.map;
  const pick = (key) => (map[key] ? values[map[key]] : undefined);
  const required = new Set([...(profile.requiredValues ?? []), ...Object.keys(profile.expect ?? {})]);
  for (const name of required) {
    if (values[name] === undefined) {
      return { status: "sensorError", values, detail: `required value ${name} was not read` };
    }
  }

  // Equipamento certo no Slave ID certo?
  for (const [name, expected] of Object.entries(profile.expect ?? {})) {
    if (values[name] !== expected) {
      return {
        status: "wrongDevice",
        values,
        detail: `${name} is ${values[name]}, expected ${expected}: check the Slave ID (${gauge.unitId}) of ${gauge.sensorId}`,
      };
    }
  }
  if (values.slaveIdReadback !== undefined && values.slaveIdReadback !== gauge.unitId) {
    return {
      status: "wrongDevice",
      values,
      detail: `slaveIdReadback is ${values.slaveIdReadback}, expected ${gauge.unitId}: check the Slave ID of ${gauge.sensorId}`,
    };
  }

  // Erro do sensor: valor sentinela ou status de comunicação ≠ 0
  const commStatus = pick("commStatus");
  const isError = (v) =>
    profile.errorValue != null && v != null && near(v, profile.errorValue);
  if (
    (commStatus != null && Math.round(commStatus) !== 0) ||
    isError(pick("level")) ||
    isError(pick("interface"))
  ) {
    const code = commStatus != null ? String(Math.round(commStatus)) : "?";
    return {
      status: "sensorError",
      values,
      detail: profile.commStatusCodes?.[code] ?? `communication status ${code}`,
    };
  }

  // Gateway com buffer: 0 minuto até o timeout = dado vencido
  const minutesToTimeout = pick("minutesToTimeout");
  if (minutesToTimeout != null && minutesToTimeout <= 0) {
    return { status: "stale", values, detail: "gateway timed this node out (no recent check-in)" };
  }

  const levelDef = profile.values[map.level];
  let level = toMeters(pick("level"), levelDef.unit);
  if (!Number.isFinite(level) || level < 0) {
    return { status: "sensorError", values, detail: `level ${level} m is not valid` };
  }
  level = round(level, 4);

  let oilWaterInterface;
  if (map.interface && (gauge.floats ?? 2) >= 2) {
    const idef = profile.values[map.interface];
    let iface = toMeters(pick("interface"), idef.unit);
    if (!Number.isFinite(iface) || iface < 0) {
      return { status: "sensorError", values, detail: `interface ${iface} m is not valid` };
    }
    // ruído na boia: a interface nunca fica acima do nível total
    iface = round(Math.min(iface, level), 4);
    oilWaterInterface = {
      oilLevel: round(level - iface, 4),
      waterLevel: iface,
      interfaceLevel: iface,
    };
  }

  const metadata = { rawData: { source: "norush-edge", profile: profile.id, unitId: gauge.unitId, wordOrder: state.wordOrder } };
  for (const [name, v] of Object.entries(values)) {
    metadata.rawData[name] = Number.isFinite(v) ? round(v, 4) : null;
  }
  const temp = pick("temperature");
  if (temp != null && Number.isFinite(temp) && !isError(temp)) {
    metadata.temperature = round(toCelsius(temp, profile.values[map.temperature].unit), 2);
  }
  const signal = pick("signal");
  // RSSI só vira signalStrength quando parece dBm; senão fica só no rawData
  if (signal != null && signal < 0 && signal >= -150) metadata.signalStrength = signal;

  const sample = { level, metadata };
  if (oilWaterInterface) sample.oilWaterInterface = oilWaterInterface;

  const batteryMv = pick("batteryMv");
  if (batteryMv != null && gauge.battery) {
    const { emptyMv, fullMv } = gauge.battery;
    const pct = ((batteryMv - emptyMv) / (fullMv - emptyMv)) * 100;
    sample.batteryLevel = round(Math.min(100, Math.max(0, pct)), 1);
  }

  return { status: "ok", values, sample, minutesToTimeout };
}

/**
 * Decide entre leitura nova, heartbeat ou nada, para não repetir a mesma
 * leitura do buffer do gateway a cada consulta.
 *   - leitura: primeiro dado, valores mudaram, contador de timeout reiniciou
 *     (check-in novo) ou passou `forceReadingSeconds` sem enviar leitura;
 *   - heartbeat: nó vivo sem dado novo, no máximo a cada `heartbeatSeconds`.
 */
export function decide(state, result, now, opts) {
  if (result.status !== "ok") return "none";
  const snap = {
    level: result.sample.level,
    interface: result.sample.oilWaterInterface?.interfaceLevel ?? null,
    temperature: result.sample.metadata.temperature ?? null,
    minutesToTimeout: result.minutesToTimeout ?? null,
  };
  const prev = state.last;
  state.last = { ...snap, at: now };

  const changed =
    !prev ||
    snap.level !== prev.level ||
    snap.interface !== prev.interface ||
    snap.temperature !== prev.temperature;
  const checkedIn =
    prev &&
    snap.minutesToTimeout != null &&
    prev.minutesToTimeout != null &&
    snap.minutesToTimeout > prev.minutesToTimeout;
  const overdue = now - state.lastReadingSentAt >= opts.forceReadingSeconds * 1000;

  if (changed || checkedIn || overdue) return "reading";
  if (now - state.lastHeartbeatAt >= opts.heartbeatSeconds * 1000) return "heartbeat";
  return "none";
}
