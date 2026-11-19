import { randomUUID } from "node:crypto";
import { GaugeState, interpret, decide } from "./gauge.js";

/**
 * Laço principal: a cada ciclo, reenvia o que estiver no buffer e depois lê
 * cada haste no gateway, uma de cada vez (um mestre por barramento).
 */
export class Runner {
  constructor({ config, gateway, client, buffer, log, now = () => Date.now() }) {
    this.config = config;
    this.gateway = gateway;
    this.client = client;
    this.buffer = buffer;
    this.log = log;
    this.now = now;
    this.states = new Map(config.gauges.map((g) => [g.sensorId, new GaugeState(g, g.profile)]));
    this.lastProblem = new Map(); // sensorId → mensagem (evita repetir log a cada ciclo)
    this.stopped = false;
    this.timer = null;
  }

  async start() {
    this.log("info", `polling ${this.config.gauges.length} gauge(s) every ${this.config.pollIntervalSeconds}s via ${this.gateway.describe()}`);
    if (this.buffer.size) this.log("info", `${this.buffer.size} buffered reading(s) to deliver`);
    const loop = async () => {
      if (this.stopped) return;
      const started = this.now();
      await this.cycle();
      const wait = Math.max(1000, this.config.pollIntervalSeconds * 1000 - (this.now() - started));
      if (!this.stopped) this.timer = setTimeout(loop, wait);
    };
    await loop();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.gateway.close();
  }

  async cycle() {
    await this.flushBuffer();
    for (const gauge of this.config.gauges) {
      if (this.stopped) return;
      await this.pollGauge(gauge);
    }
  }

  async pollGauge(gauge) {
    const state = this.states.get(gauge.sensorId);
    let registers;
    try {
      registers = await this.gateway.readBlocks(gauge.unitId, gauge.profile);
    } catch (err) {
      this.problem(gauge, err.message);
      return { status: "readFailed", detail: err.message };
    }

    const result = interpret(state, registers);
    if (result.status !== "ok") {
      this.problem(gauge, `${result.status}: ${result.detail}`);
      return result;
    }
    this.recovered(gauge);

    const now = this.now();
    const action = decide(state, result, now, this.config);
    if (action === "reading") {
      const timestamp = new Date(now).toISOString();
      const messageId = randomUUID();
      state.lastReadingSentAt = now;
      // Se há fila, a leitura nova entra no fim para manter a ordem
      if (this.buffer.size > 0) {
        this.buffer.push({ sensorId: gauge.sensorId, sample: result.sample, timestamp, messageId });
        await this.flushBuffer();
      } else {
        await this.deliver(gauge, result.sample, timestamp, messageId);
      }
    } else if (action === "heartbeat") {
      state.lastHeartbeatAt = now;
      const res = await this.client.sendHeartbeat(gauge, {
        batteryLevel: result.sample.batteryLevel,
        signalStrength: result.sample.metadata.signalStrength,
      });
      if (!res.ok) this.log(res.retry ? "warn" : "error", `${gauge.sensorId}: heartbeat not delivered (${res.reason})`);
    }
    return { ...result, action };
  }

  async deliver(gauge, sample, timestamp, messageId = randomUUID()) {
    const res = await this.client.sendReading(gauge, sample, timestamp, messageId);
    if (res.ok) {
      this.log("info", `${gauge.sensorId}: level ${sample.level} m${sample.oilWaterInterface ? `, interface ${sample.oilWaterInterface.interfaceLevel} m` : ""} sent`);
    } else if (res.retry) {
      this.log("warn", `${gauge.sensorId}: server unreachable (${res.reason}); buffering`);
      this.buffer.push({ sensorId: gauge.sensorId, sample, timestamp, messageId });
    } else {
      this.log("error", `${gauge.sensorId}: reading refused by server (${res.reason})`);
    }
    return res;
  }

  /** Reenvia o buffer na ordem; para no primeiro erro passageiro. */
  async flushBuffer() {
    while (this.buffer.size > 0 && !this.stopped) {
      const [entry] = this.buffer.peek(1);
      const gauge = this.config.gauges.find((g) => g.sensorId === entry.sensorId);
      if (!gauge) {
        this.log("warn", `dropping buffered reading of unknown gauge ${entry.sensorId}`);
        this.buffer.shift(1);
        continue;
      }
      if (!entry.messageId) {
        entry.messageId = randomUUID();
        this.buffer.rewrite();
      }
      const res = await this.client.sendReading(gauge, entry.sample, entry.timestamp, entry.messageId);
      if (res.ok) {
        this.buffer.shift(1);
      } else if (res.retry) {
        return; // servidor ainda fora: tenta no próximo ciclo
      } else {
        this.log("error", `${gauge.sensorId}: buffered reading from ${entry.timestamp} refused (${res.reason}); dropped`);
        this.buffer.shift(1);
      }
    }
  }

  problem(gauge, message) {
    if (this.lastProblem.get(gauge.sensorId) !== message) {
      this.log("warn", `${gauge.sensorId} (unit ${gauge.unitId}): ${message}`);
      this.lastProblem.set(gauge.sensorId, message);
    }
  }

  recovered(gauge) {
    if (this.lastProblem.has(gauge.sensorId)) {
      this.log("info", `${gauge.sensorId}: reading again`);
      this.lastProblem.delete(gauge.sensorId);
    }
  }
}
