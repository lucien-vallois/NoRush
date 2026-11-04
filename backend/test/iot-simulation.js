#!/usr/bin/env node

/**
 * Script de Simulação IoT COM FÍSICA - Flowback Platform
 *
 * Simulador de campo baseado em modelo físico, não em random-walk:
 *
 *   - Cada tanque (cilindro 5m x 3.2m, área ≈ 8.042 m²) tem um cenário com
 *     vazão em m³/h. O nível verdadeiro evolui por dLevel/dt = vazão / área.
 *   - SIM_SPEED acelera o RELÓGIO DA FÍSICA (1s real = SIM_SPEED s simulados),
 *     permitindo ver ciclos de enchimento/esvaziamento numa demo de minutos.
 *     O timestamp do payload continua sendo tempo real (ISO 8601).
 *   - Um dispositivo por tanque: haste magnetostritiva de duas boias (float
 *     stick). A boia de produto mede o nível total; a boia de interface (mais
 *     densa que o óleo, mais leve que a água) mede a altura da interface.
 *   - Modelo de sensor: ruído gaussiano σ=5mm quantizado em 1mm (3 casas),
 *     bateria com dreno por transmissão + recarga solar (teto 100%), sinal
 *     -50..-100 dBm em random-walk e ~3% de perda de pacotes (contabilizada).
 *   - Interface óleo/água CONSISTENTE com o validador do backend:
 *     oilLevel + waterLevel = level (tolerância 1mm) e
 *     interfaceLevel = waterLevel (altura da interface medida do fundo).
 *   - Falha programada: SENSOR-004 (FK-04) entra com bateria crítica (12%),
 *     drena aceleradamente até 5% e então silencia (sensor offline).
 *
 * Cenários por tanque:
 *   FK-01: enchendo 1.2 m³/h desde ~1.8m
 *   FK-02: enchimento RÁPIDO 2.5 m³/h desde ~3.8m (cruza 4.2m e 4.6m -> alertas)
 *   FK-03: esvaziando 2.0 m³/h desde ~1.4m (cruza 0.5m e 0.3m -> nível baixo)
 *   FK-04: estático com micro-ruído ±0.05 m³/h
 *   FK-05: parte de 4.45m enchendo 0.8 m³/h (demora, mas chega ao overflow)
 *   FK-06: em manutenção — não transmite
 *
 * Uso:
 *   node test/iot-simulation.js [mqtt|http]
 *
 * Variáveis de ambiente:
 *   MQTT_HOST, MQTT_PORT, MQTT_TOPIC_SENSOR_DATA   (conexão MQTT)
 *   HTTP_HOST, HTTP_PORT                           (endpoint HTTP)
 *   SIM_INTERVAL  (ms entre ciclos, default 5000)
 *   SIM_DURATION  (ms de simulação, default 60000)
 *   SIM_SPEED     (aceleração do tempo simulado, default 60)
 *   SENSORS       (lista que sobrescreve os sensores ativos, ex.: "SENSOR-001,SENSOR-003")
 */

const mqtt = require('mqtt');
const http = require('http');

// ============================== FÍSICA DO PROCESSO ==============================

// Tanques cilíndricos 5m (altura) x 3.2m (diâmetro) — mesmos valores do seed.ts
const TANK_AREA_M2 = Math.PI * (3.2 / 2) ** 2; // ≈ 8.042 m²
const LEVEL_MIN_M = 0.05; // fundo operacional (bomba perde aspiração antes de zerar)
const LEVEL_MAX_M = 4.95; // teto físico (tanque 5m; mantém a leitura na faixa 0-5m)

// Modelo de sensor
const NOISE_SIGMA_M = 0.005; // ruído gaussiano σ = 5mm
const PACKET_LOSS_RATE = 0.03; // ~3% das transmissões são perdidas (drop)
const BATTERY_DRAIN_PER_TX = 0.01; // % por transmissão
const BATTERY_SOLAR_GAIN = 0.02; // recarga solar por ciclo (teto de 100%)

// Cenários por tanque (vazão positiva = enchendo, negativa = esvaziando)
const TANK_SCENARIOS = {
  'FK-01': { level: 1.8, flow: 1.2, label: 'enchendo 1.2 m³/h' },
  'FK-02': { level: 3.8, flow: 2.5, label: 'enchimento rápido 2.5 m³/h' },
  'FK-03': { level: 1.4, flow: -2.0, label: 'esvaziando 2.0 m³/h' },
  'FK-04': { level: 3.1, flow: 0, jitter: 0.05, label: 'estático (±0.05 m³/h)' },
  'FK-05': { level: 4.45, flow: 0.8, label: 'enchendo devagar 0.8 m³/h' },
  'FK-06': { level: 0.25, flow: 0, offline: true, label: 'em manutenção — offline' },
};

// Registro sensor -> tanque: uma haste de duas boias por tanque (mesma ordem do seed.ts)
const SENSOR_REGISTRY = {
  'SENSOR-001': { tank: 'FK-01' },
  'SENSOR-002': { tank: 'FK-02' },
  'SENSOR-003': { tank: 'FK-03' },
  'SENSOR-004': { tank: 'FK-04' },
  'SENSOR-005': { tank: 'FK-05' },
  'SENSOR-006': { tank: 'FK-06' },
};

// Sensores ativos por padrão: todos, exceto os do tanque em manutenção (FK-06)
const DEFAULT_SENSORS = Object.keys(SENSOR_REGISTRY).filter(
  (id) => !TANK_SCENARIOS[SENSOR_REGISTRY[id].tank].offline
);

// Falha programada: bateria doente no SENSOR-004 (drena ~50x mais rápido e silencia)
const DYING_SENSOR = { id: 'SENSOR-004', startBattery: 12, drainPerTx: 0.5, silentBelow: 5 };

// ============================== CONFIGURAÇÃO ==============================

const config = {
  mqtt: {
    host: process.env.MQTT_HOST || 'localhost',
    port: process.env.MQTT_PORT || 1883,
    topic: process.env.MQTT_TOPIC_SENSOR_DATA || 'sensors/data',
  },
  http: {
    host: process.env.HTTP_HOST || 'localhost',
    port: process.env.HTTP_PORT || 3000,
    path: '/iot/sensors/data',
  },
  simulation: {
    sensors: (process.env.SENSORS ? process.env.SENSORS : DEFAULT_SENSORS.join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    interval: parseInt(process.env.SIM_INTERVAL || '5000', 10), // 5 segundos reais
    duration: parseInt(process.env.SIM_DURATION || '60000', 10), // 1 minuto real
    speed: Math.max(1, parseInt(process.env.SIM_SPEED || '60', 10)), // 1s real = 60s simulados
    protocol: process.argv[2] || 'mqtt', // mqtt ou http
  },
};

// ============================== ESTADO PERSISTENTE ==============================

// Nível verdadeiro por tanque (o processo físico em si)
const tankState = {};
// Telemetria por sensor (bateria, sinal, temperatura)
const sensorState = {};
// Relógio da simulação (física acelerada)
const simClock = { ticks: 0, simElapsedMs: 0 };

function getTankState(tankCode) {
  if (!tankState[tankCode]) {
    const sc = TANK_SCENARIOS[tankCode];
    tankState[tankCode] = {
      initialLevel: sc.level,
      level: sc.level,
      lastFlow: sc.flow,
      // cada tanque evolui a fração de água com um pequeno defasagem própria
      fractionJitter: (Math.random() - 0.5) * 0.04,
    };
  }
  return tankState[tankCode];
}

function getSensorState(sensorId) {
  if (!sensorState[sensorId]) {
    const tankCode = SENSOR_REGISTRY[sensorId].tank;
    sensorState[sensorId] = {
      battery: 100,
      solar: true, // painel solar: recarrega até o teto de 100%
      signal: -(55 + Math.random() * 30), // -55..-85 dBm
      temperature: 22 + Math.random() * 8, // 22..30 °C
      txCount: 0,
      silent: false,
    };
    if (tankCode === 'FK-04') {
      // haste do FK-04 sem painel solar e já com bateria usada (~70%)
      const st = sensorState[sensorId];
      st.solar = false;
      st.battery = 68 + Math.random() * 5;
    }
    if (sensorId === DYING_SENSOR.id) {
      sensorState[sensorId].battery = DYING_SENSOR.startBattery;
      sensorState[sensorId].solar = false;
    }
  }
  return sensorState[sensorId];
}

// ============================== HELPERS ==============================

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Amostra gaussiana (Box-Muller) com média 0
function gaussian(sigma) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Fração de água do tanque: flowback é majoritariamente água; a fração
// evolui lentamente 0.60 -> 0.80 ao longo da simulação
function waterFraction(tankCode) {
  const totalSimMs = config.simulation.duration * config.simulation.speed;
  const progress = clamp(simClock.simElapsedMs / totalSimMs, 0, 1);
  const st = getTankState(tankCode);
  return clamp(0.6 + 0.2 * progress + st.fractionJitter, 0.55, 0.85);
}

/**
 * Interface óleo/água da haste de duas boias.
 *
 * Tudo em milímetros (resolução da haste): a boia de interface fica na altura
 * da coluna de água; a coluna de óleo é o restante até a boia de produto.
 * oilLevel/waterLevel são espessuras das camadas; interfaceLevel é a altura
 * da interface medida a partir do fundo (= waterLevel).
 */
const INTERFACE_MIN_LEVEL_M = 0.3; // abaixo disso a boia de interface não flutua livre

function buildInterface(levelMm, fraction) {
  if (levelMm / 1000 < INTERFACE_MIN_LEVEL_M) return null; // campo opcional
  const waterMm = clamp(Math.round(levelMm * fraction), 0, levelMm);
  const waterLevel = waterMm / 1000;
  const oilLevel = (levelMm - waterMm) / 1000;
  return { oilLevel, waterLevel, interfaceLevel: waterLevel };
}

// ============================== FÍSICA ==============================

/**
 * Avança o processo físico de todos os tanques por dtSimMs de TEMPO SIMULADO.
 * dLevel/dt = vazão (m³/h) / área (m²), aplicado com dt = intervalo x SIM_SPEED.
 */
function advanceTanks(dtSimMs) {
  simClock.ticks += 1;
  simClock.simElapsedMs += dtSimMs;
  const dtHours = dtSimMs / 1000 / 3600;

  for (const [code, sc] of Object.entries(TANK_SCENARIOS)) {
    if (sc.offline) continue; // manutenção: processo congelado
    const st = getTankState(code);

    // FK-04: micro-ruído na vazão; demais: vazão do cenário
    const flow = sc.jitter ? (Math.random() * 2 - 1) * sc.jitter : sc.flow;
    st.lastFlow = flow;
    st.level = clamp(st.level + (flow / TANK_AREA_M2) * dtHours, LEVEL_MIN_M, LEVEL_MAX_M);
  }
}

/**
 * Amostra um sensor contra o estado atual (medição + bateria + rádio).
 * Não avança o nível do tanque — quem faz isso é advanceTanks() por ciclo.
 * O parâmetro opcional dtSimMs serve ao uso standalone (require) da API.
 */
function sampleSensor(sensorId) {
  const reg = SENSOR_REGISTRY[sensorId];
  if (!reg) {
    throw new Error(`Sensor desconhecido: ${sensorId} (use um de SENSOR-001..SENSOR-006)`);
  }
  const tank = getTankState(reg.tank);
  const s = getSensorState(sensorId);

  // Bateria: dreno por transmissão + recarga solar (teto 100%)
  const drain = sensorId === DYING_SENSOR.id ? DYING_SENSOR.drainPerTx : BATTERY_DRAIN_PER_TX;
  s.battery = clamp(s.battery - drain, 0, 100);
  if (s.solar) s.battery = clamp(s.battery + Math.random() * BATTERY_SOLAR_GAIN, 0, 100);
  s.txCount += 1;

  // Falha programada: a haste com bateria doente silencia quando a bateria crítica esgota
  if (!s.silent && sensorId === DYING_SENSOR.id && s.battery <= DYING_SENSOR.silentBelow) {
    s.silent = true;
    console.log(
      `🔴 FALHA PROGRAMADA: ${sensorId} (${reg.tank}) bateria esgotada (${s.battery.toFixed(2)}%) — sensor OFFLINE, parando de transmitir`
    );
  }

  // Rádio: sinal em random-walk; temperatura ambiente suave
  s.signal = clamp(s.signal + (Math.random() - 0.5) * 4, -100, -50);
  s.temperature = clamp(s.temperature + (Math.random() - 0.5) * 0.4, 20, 35);

  // Medição: nível verdadeiro + ruído gaussiano σ=5mm
  const measured = tank.level + gaussian(NOISE_SIGMA_M);

  // Boia de produto: resolução de 1mm (3 casas decimais) dentro da faixa 0-5m
  const levelMm = clamp(Math.round(measured * 1000), 1, 4999);
  const level = levelMm / 1000;
  // Boia de interface: mesma haste, mesma resolução
  const oilWaterInterface = buildInterface(levelMm, waterFraction(reg.tank));

  return {
    sensorId,
    level,
    batteryLevel: Math.round(s.battery * 100) / 100,
    timestamp: new Date().toISOString(), // tempo REAL — a aceleração é só da física
    oilWaterInterface,
    metadata: {
      signalStrength: Math.round(s.signal),
      temperature: Math.round(s.temperature * 10) / 10,
      humidity: Math.round((40 + Math.random() * 40) * 10) / 10, // 40-80%
      // Ground truth da simulação (útil para comparar medição x realidade)
      rawData: {
        trueLevelM: Math.round(tank.level * 1000) / 1000,
        flowM3h: Math.round(tank.lastFlow * 1000) / 1000,
        waterFraction: Math.round(waterFraction(reg.tank) * 1000) / 1000,
        simTimeMin: Math.round(simClock.simElapsedMs / 60000),
      },
    },
    version: '2.0.0',
  };
}

// ============================== TRANSPORTE ==============================

// Cliente MQTT
let mqttClient = null;

// Estatísticas
const stats = {
  messagesSent: 0,
  messagesSuccess: 0,
  messagesError: 0,
  messagesDropped: 0,
  silentSensors: 0,
  startTime: Date.now(),
  endTime: null,
};

// Perda de pacote simulada: ~3% das transmissões não chegam ao broker/servidor
function dropPacket(sensorId, data) {
  if (Math.random() >= PACKET_LOSS_RATE) return false;
  stats.messagesDropped += 1;
  console.log(`📵 ${sensorId} (${SENSOR_REGISTRY[sensorId].tank}): pacote PERDIDO (nível ${data.level}m não publicado)`);
  return true;
}

// Função para gerar dados simulados de sensor (API exportada)
function generateSensorData(sensorId, dtSimMs = 0) {
  // Uso standalone: avança a física do tanque do sensor antes de medir
  if (dtSimMs > 0 && !TANK_SCENARIOS[SENSOR_REGISTRY[sensorId].tank].offline) {
    const st = getTankState(SENSOR_REGISTRY[sensorId].tank);
    const dtHours = dtSimMs / 1000 / 3600;
    st.lastFlow = TANK_SCENARIOS[SENSOR_REGISTRY[sensorId].tank].flow;
    st.level = clamp(st.level + (st.lastFlow / TANK_AREA_M2) * dtHours, LEVEL_MIN_M, LEVEL_MAX_M);
  }
  // Credencial de ingestão: SIM_DEVICE_TOKEN (credencial individual de um
  // dispositivo provisionado em /devices) tem precedência sobre a chave
  // compartilhada IOT_INGEST_KEY usada pela demonstração.
  const authToken = process.env.SIM_DEVICE_TOKEN || process.env.IOT_INGEST_KEY || undefined;
  return { ...sampleSensor(sensorId), authToken };
}

// Função para enviar dados via MQTT
function sendMQTT(sensorId) {
  if (!mqttClient) {
    console.error('Cliente MQTT não conectado');
    return;
  }

  const data = generateSensorData(sensorId);
  if (dropPacket(sensorId, data)) return;

  const payload = JSON.stringify(data);

  mqttClient.publish(config.mqtt.topic, payload, { qos: 1, retain: false }, (err) => {
    stats.messagesSent++;

    if (err) {
      stats.messagesError++;
      console.error(`❌ Erro ao enviar MQTT para ${sensorId}:`, err.message);
    } else {
      stats.messagesSuccess++;
      logTransmission(data, 'MQTT');
    }
  });
}

// Função para enviar dados via HTTP
function sendHTTP(sensorId) {
  const data = generateSensorData(sensorId);
  if (dropPacket(sensorId, data)) return;

  const payload = JSON.stringify(data);

  const options = {
    hostname: config.http.host,
    port: config.http.port,
    path: config.http.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'User-Agent': 'Flowback-Sensor-Simulator/2.0',
    },
  };

  const req = http.request(options, (res) => {
    stats.messagesSent++;
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        stats.messagesSuccess++;
        logTransmission(data, `HTTP ${res.statusCode}`);
      } else {
        stats.messagesError++;
        console.error(`❌ HTTP erro para ${sensorId}: status=${res.statusCode}, resposta=${responseData}`);
      }
    });
  });

  req.on('error', (err) => {
    stats.messagesSent++;
    stats.messagesError++;
    console.error(`❌ HTTP erro de conexão para ${sensorId}:`, err.message);
  });

  req.write(payload);
  req.end();
}

// Log de transmissão com resumo da medição
function logTransmission(data, proto) {
  const reg = SENSOR_REGISTRY[data.sensorId];
  const ifc = data.oilWaterInterface
    ? ` óleo/água=${data.oilWaterInterface.oilLevel.toFixed(2)}/${data.oilWaterInterface.waterLevel.toFixed(2)}m`
    : '';
  console.log(
    `📡 ${proto} ${data.sensorId} (${reg.tank} float stick): nível=${data.level}m${ifc} bateria=${data.batteryLevel.toFixed(2)}% sinal=${data.metadata.signalStrength}dBm`
  );
}

// ============================== MQTT: CONEXÃO ==============================

function connectMQTT() {
  return new Promise((resolve, reject) => {
    console.log(`🔌 Conectando ao MQTT: ${config.mqtt.host}:${config.mqtt.port}`);

    const client = mqtt.connect({
      host: config.mqtt.host,
      port: config.mqtt.port,
      clientId: `flowback-simulator-${Date.now()}`,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10000,
    });

    client.on('connect', () => {
      console.log('✅ Conectado ao MQTT broker');
      mqttClient = client;
      resolve(client);
    });

    client.on('error', (err) => {
      console.error('❌ Erro na conexão MQTT:', err.message);
      reject(err);
    });

    client.on('disconnect', () => {
      console.log('📴 Desconectado do MQTT broker');
    });
  });
}

function disconnectMQTT() {
  if (mqttClient) {
    console.log('🔌 Desconectando do MQTT...');
    mqttClient.end();
    mqttClient = null;
  }
}

// ============================== RELATÓRIOS ==============================

// Função para exibir estatísticas
function printStats() {
  stats.endTime = Date.now();
  const duration = (stats.endTime - stats.startTime) / 1000;
  const simHours = simClock.simElapsedMs / 3600000;
  const attempts = stats.messagesSent + stats.messagesDropped;
  const successRate = stats.messagesSent > 0 ? (stats.messagesSuccess / stats.messagesSent * 100).toFixed(1) : '0.0';
  const dropRate = attempts > 0 ? (stats.messagesDropped / attempts * 100).toFixed(1) : '0.0';
  const messagesPerSecond = (attempts / duration).toFixed(2);

  console.log('\n📊 === ESTATÍSTICAS DA SIMULAÇÃO ===');
  console.log(`⏱️  Duração real: ${duration.toFixed(1)}s | Tempo simulado: ${simHours.toFixed(2)}h (${simClock.ticks} ciclos)`);
  console.log(`📤 Transmissões: ${attempts} (publicadas: ${stats.messagesSent}, perdidas: ${stats.messagesDropped} — ${dropRate}%)`);
  console.log(`✅ Sucesso: ${stats.messagesSuccess} | ❌ Erros: ${stats.messagesError}`);
  console.log(`📈 Taxa de sucesso: ${successRate}% | ⚡ Throughput: ${messagesPerSecond} msg/s`);

  // Bateria final por sensor
  console.log('\n🔋 Bateria final por sensor:');
  for (const id of Object.keys(SENSOR_REGISTRY)) {
    const reg = SENSOR_REGISTRY[id];
    if (TANK_SCENARIOS[reg.tank].offline) {
      console.log(`   ${id}: — (FK-06 em manutenção, não transmite)`);
      continue;
    }
    const s = sensorState[id];
    if (!s) {
      console.log(`   ${id}: — (não transmitiu nesta execução)`);
      continue;
    }
    const flag = s.silent ? ' ☠️ OFFLINE (bateria esgotada)' : '';
    console.log(`   ${id} (${reg.tank}): ${s.battery.toFixed(2)}% [${s.txCount} tx]${flag}`);
  }

  // Nível final por tanque
  console.log('\n🛢️  Nível final por tanque:');
  for (const [code, sc] of Object.entries(TANK_SCENARIOS)) {
    if (sc.offline) {
      console.log(`   ${code}: offline — ${sc.label}`);
      continue;
    }
    const st = getTankState(code);
    const delta = st.level - st.initialLevel;
    console.log(
      `   ${code}: ${st.initialLevel.toFixed(3)}m -> ${st.level.toFixed(3)}m (Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}m | ${sc.label})`
    );
  }
  console.log('=====================================\n');
}

// Cabeçalho com o cenário completo (para conferir a física antes de rodar)
function printScenario() {
  const dtSimMs = config.simulation.interval * config.simulation.speed;
  console.log(`⚡ SIM_SPEED=${config.simulation.speed} (1s real = ${config.simulation.speed}s simulados)`);
  console.log(`🕐 Ciclo de ${config.simulation.interval}ms real = ${(dtSimMs / 1000).toFixed(0)}s simulados | área do tanque = ${TANK_AREA_M2.toFixed(3)} m²`);
  console.log('\n🛢️  Cenários por tanque (Δ nível por ciclo):');
  for (const [code, sc] of Object.entries(TANK_SCENARIOS)) {
    if (sc.offline) {
      console.log(`   ${code}: ${sc.label}`);
      continue;
    }
    const dLevel = (sc.flow / TANK_AREA_M2) * (dtSimMs / 3600000); // metros por ciclo
    console.log(
      `   ${code}: inicia ${sc.level.toFixed(2)}m — ${sc.label} (Δ ${dLevel >= 0 ? '+' : ''}${(dLevel * 1000).toFixed(1)}mm/ciclo)`
    );
  }
  console.log(`\n🔋 ${DYING_SENSOR.id}: bateria crítica inicial ${DYING_SENSOR.startBattery}% (drena ${DYING_SENSOR.drainPerTx}%/tx, silencia em ${DYING_SENSOR.silentBelow}%)`);
  console.log('');
}

// ============================== EXECUÇÃO ==============================

// Sensores válidos para esta execução (filtra desconhecidos e o tanque em manutenção)
function resolveActiveSensors() {
  const active = [];
  for (const id of config.simulation.sensors) {
    const reg = SENSOR_REGISTRY[id];
    if (!reg) {
      console.warn(`⚠️  ${id}: sensor desconhecido — ignorado`);
      continue;
    }
    if (TANK_SCENARIOS[reg.tank].offline) {
      console.warn(`⚠️  ${id}: tanque ${reg.tank} em manutenção — não transmite`);
      continue;
    }
    active.push(id);
  }
  return active;
}

// Função principal
async function main() {
  console.log('🚀 Iniciando Simulação IoT (física) - Flowback Platform');
  console.log(`📋 Protocolo: ${config.simulation.protocol.toUpperCase()}`);
  console.log(`🔧 Sensores: ${config.simulation.sensors.join(', ')}`);
  console.log(`⏰ Intervalo: ${config.simulation.interval}ms | ⏳ Duração: ${config.simulation.duration}ms`);
  printScenario();

  const activeSensors = resolveActiveSensors();
  if (activeSensors.length === 0) {
    console.error('Nenhum sensor ativo para simular. Saindo...');
    process.exit(1);
  }

  // Conectar MQTT se necessário
  if (config.simulation.protocol === 'mqtt') {
    try {
      await connectMQTT();
    } catch (error) {
      console.error('Falha ao conectar MQTT. Saindo...');
      process.exit(1);
    }
  }

  // Um ciclo da simulação: avança a física e transmite todos os sensores ativos
  const tick = () => {
    const dtSimMs = config.simulation.interval * config.simulation.speed;
    advanceTanks(dtSimMs);

    for (const sensorId of activeSensors) {
      if (sensorState[sensorId] && sensorState[sensorId].silent) continue; // sensor offline
      if (config.simulation.protocol === 'mqtt') {
        sendMQTT(sensorId);
      } else if (config.simulation.protocol === 'http') {
        sendHTTP(sensorId);
      }
    }
  };

  // Iniciar simulação (primeiro ciclo imediato)
  console.log('▶️  Iniciando simulação...');
  tick();
  const interval = setInterval(tick, config.simulation.interval);

  // Encerramento programado
  const shutdown = (reason) => {
    clearInterval(interval);
    stats.silentSensors = Object.values(sensorState).filter((s) => s.silent).length;

    if (config.simulation.protocol === 'mqtt') {
      disconnectMQTT();
    }

    // Pequeno delay para garantir ACKs das últimas publicações
    setTimeout(() => {
      printStats();
      console.log(`🏁 Simulação concluída (${reason})!`);
      process.exit(0);
    }, 1500);
  };

  setTimeout(() => shutdown('duração atingida'), config.simulation.duration);

  // Tratamento de sinais para encerramento graceful
  process.on('SIGINT', () => {
    console.log('\n⏹️  Interrupção detectada. Finalizando...');
    shutdown('interrupção');
  });

  process.on('SIGTERM', () => {
    console.log('\n⏹️  Terminação detectada. Finalizando...');
    shutdown('terminação');
  });
}

// Verificar argumentos e executar
if (require.main === module) {
  const protocol = process.argv[2];

  if (protocol && !['mqtt', 'http'].includes(protocol)) {
    console.error('Uso: node iot-simulation.js [mqtt|http]');
    console.error('Exemplos:');
    console.error('  node iot-simulation.js mqtt   # Simulação via MQTT');
    console.error('  node iot-simulation.js http   # Simulação via HTTP');
    console.error('  node iot-simulation.js        # Padrão: MQTT');
    console.error('Env: SIM_INTERVAL, SIM_DURATION, SIM_SPEED, SENSORS, MQTT_HOST, MQTT_PORT, MQTT_TOPIC_SENSOR_DATA, HTTP_HOST, HTTP_PORT');
    process.exit(1);
  }

  main().catch((error) => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = {
  generateSensorData,
  sendMQTT,
  sendHTTP,
  config,
};
