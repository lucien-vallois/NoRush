#!/usr/bin/env node
/**
 * Smoke test headless do WebSocket do Flowback.
 *
 * 1. Conecta socket.io em http://localhost:3000 e assina
 *    reading / forecast / alert / anomaly.
 * 2. Sobe a simulação IoT do backend (child_process.spawn) com
 *    SIM_DURATION=25000 SIM_INTERVAL=2000 SIM_SPEED=240.
 * 3. Coleta eventos por ~30s, imprime contagens por tipo e sai com
 *    código 0 se received('reading') >= 5 (forecast pode ser 0 — o
 *    cron do backend é de 5min).
 *
 * Uso (a partir de frontend/): node test/ws-smoke.mjs
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { io } from "socket.io-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(__dirname, "..");
const BACKEND_DIR = path.resolve(FRONTEND_DIR, "..", "backend");

const WS_URL = process.env.WS_URL || "http://localhost:3000";
const COLLECT_MS = 30_000;
const MIN_READINGS = 5;

const EVENTS = ["reading", "forecast", "alert", "anomaly"];
const counts = Object.fromEntries(EVENTS.map((e) => [e, 0]));
const samples = Object.fromEntries(EVENTS.map((e) => [e, null]));

function log(msg) {
  console.log(`[ws-smoke] ${msg}`);
}

const loginResponse = await fetch(`${WS_URL}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: process.env.DEMO_EMAIL || "operador@flowback.com",
    password: process.env.DEMO_PASSWORD || "operador123",
  }),
});
if (!loginResponse.ok)
  throw new Error(`Demo login failed: HTTP ${loginResponse.status}`);
const { accessToken } = await loginResponse.json();

const socket = io(WS_URL, {
  auth: { token: accessToken },
  reconnection: false,
  timeout: 10_000,
});

socket.on("connect", () => {
  log(`socket conectado (${socket.id})`);
});

socket.on("connect_error", (err) => {
  log(`erro de conexão: ${err.message}`);
});

for (const event of EVENTS) {
  socket.on(event, (msg) => {
    counts[event] += 1;
    if (!samples[event]) {
      samples[event] = msg?.payload ?? msg;
    }
  });
}

function timeout(ms, label) {
  return new Promise((resolve) => {
    setTimeout(() => {
      log(`timeout de ${label} (${ms}ms)`);
      resolve();
    }, ms);
  });
}

async function waitForConnect() {
  if (socket.connected) return true;
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 10_000);
    socket.once("connect", () => {
      clearTimeout(t);
      resolve();
    });
    socket.once("connect_error", () => {
      clearTimeout(t);
      resolve();
    });
  });
  return socket.connected;
}

try {
  const ok = await waitForConnect();
  if (!ok) {
    console.error(
      "[ws-smoke] FALHA: não foi possível conectar o socket em",
      WS_URL,
    );
    process.exit(2);
  }

  // Aguarda o handshake/assinatura 'connected' do servidor antes de simular
  await new Promise((r) => setTimeout(r, 500));

  log(`spawn: node test/iot-simulation.js (cwd=${BACKEND_DIR})`);
  const sim = spawn(process.execPath, ["test/iot-simulation.js", "mqtt"], {
    cwd: BACKEND_DIR,
    env: {
      ...process.env,
      SIM_DURATION: "25000",
      SIM_INTERVAL: "2000",
      SIM_SPEED: "240",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let simStdout = "";
  sim.stdout.on("data", (d) => {
    simStdout += d.toString();
  });
  sim.stderr.on("data", (d) => {
    const s = d.toString().trim();
    if (s) log(`sim(stderr): ${s}`);
  });
  const simExited = new Promise((resolve) =>
    sim.on("exit", (code) => resolve(code)),
  );
  sim.on("error", (err) => log(`sim não pôde ser iniciado: ${err.message}`));

  // Coleta eventos pela janela de teste
  await timeout(COLLECT_MS, "coleta de eventos");

  if (sim.exitCode === null) {
    log("simulação ainda ativa — encerrando processo filho");
    sim.kill();
    await Promise.race([simExited, new Promise((r) => setTimeout(r, 3000))]);
  }

  socket.close();

  log("--- contagens por evento ---");
  for (const event of EVENTS) {
    log(`${event.padEnd(9)}: ${counts[event]}`);
  }
  log("--- primeiro payload recebido (por tipo) ---");
  for (const event of EVENTS) {
    log(
      `${event.padEnd(9)}: ${samples[event] ? JSON.stringify(samples[event]).slice(0, 160) : "—"}`,
    );
  }

  if (counts.reading >= MIN_READINGS) {
    log(
      `OK — ${counts.reading} readings (mínimo ${MIN_READINGS}). ` +
        `alert=${counts.alert} anomaly=${counts.anomaly} forecast=${counts.forecast} (forecast pode ser 0: cron de 5min)`,
    );
    process.exit(0);
  } else {
    console.error(
      `[ws-smoke] FALHA — apenas ${counts.reading} readings em ${COLLECT_MS}ms (mínimo ${MIN_READINGS}). ` +
        `Últimas linhas da simulação:\n${simStdout.split("\n").slice(-10).join("\n")}`,
    );
    process.exit(1);
  }
} catch (err) {
  console.error("[ws-smoke] erro inesperado:", err);
  socket.close();
  process.exit(3);
}
