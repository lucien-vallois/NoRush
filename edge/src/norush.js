/**
 * Cliente do contrato de dispositivo do NoRush (docs/hardware-integration.md):
 *   POST /iot/sensors/data       leitura
 *   POST /iot/sensors/heartbeat  sinal de vida sem leitura
 * A credencial de cada haste vai no header X-Device-Token.
 *
 * Resultado:
 *   { ok: true }                         aceito e processado
 *   { ok: false, retry: true, reason }   rede, timeout, 429 ou 5xx — guardar e reenviar
 *   { ok: false, retry: false, reason }  recusado (credencial, validação) — não adianta repetir
 */

export const CLIENT_VERSION = "norush-edge/0.1.0";

export class NoRushClient {
  constructor({ url, timeoutMs = 10000, fetchImpl = globalThis.fetch }) {
    if (!url) throw new Error("norush.url is required");
    this.base = url.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async sendReading(gauge, sample, timestamp) {
    const body = {
      sensorId: gauge.sensorId,
      level: sample.level,
      timestamp,
      version: CLIENT_VERSION,
      metadata: sample.metadata,
    };
    if (sample.oilWaterInterface) body.oilWaterInterface = sample.oilWaterInterface;
    if (sample.batteryLevel != null) body.batteryLevel = sample.batteryLevel;
    const res = await this.post("/iot/sensors/data", gauge.token, body);
    if (!res.ok) return res;
    // A API responde 200 também quando recusa: o resultado vem em `processed`
    if (res.json?.processed === true) return { ok: true };
    const errors = Array.isArray(res.json?.errors) ? res.json.errors.join("; ") : "not processed";
    return { ok: false, retry: false, reason: errors };
  }

  async sendHeartbeat(gauge, info) {
    const body = { sensorId: gauge.sensorId, timestamp: new Date().toISOString() };
    if (info.batteryLevel != null) body.batteryLevel = info.batteryLevel;
    if (info.signalStrength != null) body.signalStrength = info.signalStrength;
    const res = await this.post("/iot/sensors/heartbeat", gauge.token, body);
    if (!res.ok) return res;
    if (res.json?.received === true) return { ok: true };
    return { ok: false, retry: false, reason: res.json?.reason ?? "heartbeat refused" };
  }

  async post(path, token, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Token": token,
          "User-Agent": CLIENT_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      let json = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      if (response.status === 429 || response.status >= 500) {
        return { ok: false, retry: true, reason: `HTTP ${response.status}` };
      }
      if (!response.ok) {
        const msg = json?.message;
        return {
          ok: false,
          retry: false,
          reason: `HTTP ${response.status}${msg ? `: ${Array.isArray(msg) ? msg.join("; ") : msg}` : ""}`,
        };
      }
      return { ok: true, json };
    } catch (err) {
      const reason = err?.name === "AbortError" ? `timeout after ${this.timeoutMs} ms` : err?.message ?? String(err);
      return { ok: false, retry: true, reason };
    } finally {
      clearTimeout(timer);
    }
  }
}
