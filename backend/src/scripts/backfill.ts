/**
 * Backfill de histórico do Flowback IIoT.
 *
 * Gera ~DAYS dias de leituras realistas (sawtooth de enchimento/escoamento)
 * para os sensores ativos dos tanques ativos (FK-06 em manutenção fica de fora),
 * deriva alertas históricos a partir das leituras da haste de nível e carrega tudo via
 * COPY FROM STDIN do Postgres.
 *
 * Uso:
 *   npm run backfill                          # 90 dias, step 5 min, seed 42
 *   DAYS=1 npm run backfill                   # teste rápido de 1 dia
 *   FORCE_BACKFILL=1 npm run backfill         # ignora trava de segurança
 *   BACKFILL_ROLLBACK=1 DAYS=1 npm run backfill  # ensaio: executa tudo e faz ROLLBACK
 *   DAYS=14 node dist/scripts/backfill.js     # build de produção (ex.: demo no Railway)
 *
 * Parâmetros (env): DAYS, STEP_MINUTES, BACKFILL_SEED, FORCE_BACKFILL.
 * Determinístico: mesma seed + mesmo cadastro de tanques => mesmo histórico.
 * Segurança: aborta se a tabela readings já tiver mais de 10000 linhas, a
 * menos que FORCE_BACKFILL=1. Nunca apaga dados existentes.
 */
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { resolveDbEnv } from '../config/db-env';

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------
const DAYS = parseInt(process.env.DAYS ?? '90', 10);
const STEP_MINUTES = parseInt(process.env.STEP_MINUTES ?? '5', 10);
const SEED = parseInt(process.env.BACKFILL_SEED ?? '42', 10);
const FORCE = process.env.FORCE_BACKFILL === '1';
const ROLLBACK_MODE = process.env.BACKFILL_ROLLBACK === '1';
const COMMIT_EVERY = 20000; // linhas por transação de COPY
const ALERT_CHUNK = 500; // linhas por INSERT de alertas
const COOLDOWN_MS = 2 * 3600 * 1000; // cooldown entre alertas do mesmo tipo
const ACTIVE_WINDOW_MS = 12 * 3600 * 1000; // cruzamentos recentes ficam 'active'

const AREA = Math.PI * 1.6 * 1.6; // m² — cilindro do seed (3.2m de diâmetro)
const MIN_LEVEL = 0.2;
const MAX_LEVEL = 4.85;
const STEP_MS = STEP_MINUTES * 60 * 1000;

// ---------------------------------------------------------------------------
// PRNG determinístico (mulberry32)
// ---------------------------------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface ArqueacaoPoint {
  level: number;
  volume: number;
}

interface TankInfo {
  id: string;
  code: string;
  arqueacao: ArqueacaoPoint[] | null;
  maxThreshold: number; // 4.20
  minThreshold: number; // 0.30
  overflowThreshold: number; // 4.60
  lowThreshold: number; // 0.50
  gauge: SensorInfo | null; // haste de duas boias (nível + interface)
  gaugeType?: string;
}

interface SensorInfo {
  id: string; // uuid (FK de readings."sensorId")
  sensorId: string; // texto SENSOR-001..
}

interface AlertRow {
  id: string;
  tankId: string;
  type: 'overflow_risk' | 'high_level' | 'low_level';
  severity: 'critical' | 'high' | 'medium';
  status: 'active' | 'resolved';
  title: string;
  message: string;
  currentLevel: string;
  currentVolume: string;
  thresholdValue: string;
  sensorId: string;
  resolvedAt: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// COPY FROM STDIN com o client do `pg` (submittable + CopyData), sem deps extras
// ---------------------------------------------------------------------------
function copyFromText(
  client: Client,
  copyQuery: string,
  data: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (err?: Error | null) => {
      if (!done) {
        done = true;
        err ? reject(err) : resolve();
      }
    };
    const submittable = {
      submit(connection: any) {
        connection.query(copyQuery);
      },
      handleCopyInResponse(connection: any) {
        try {
          const buf = Buffer.from(data, 'utf8');
          const slice = 4 * 1024 * 1024;
          for (let i = 0; i < buf.length; i += slice) {
            connection.sendCopyFromChunk(
              buf.subarray(i, Math.min(i + slice, buf.length)),
            );
          }
          connection.endCopyFrom();
        } catch (e) {
          connection.sendCopyFail(String(e));
        }
      },
      handleCopyData() {},
      handleCommandComplete() {},
      handleError(err: Error) {
        finish(err);
      },
      handleReadyForQuery() {
        finish();
      },
      callback: (err: Error | null) => finish(err),
    };
    client.query(submittable as any, (err: Error | null) => finish(err)) as any;
  });
}

/** Escapa um valor texto para o formato COPY (tab/newline/backslash). */
function copyEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n');
}

// ---------------------------------------------------------------------------
// Arqueação: interpolação linear nível -> volume (litros)
// ---------------------------------------------------------------------------
function makeLevelToVolume(
  table: ArqueacaoPoint[] | null,
): (level: number) => number {
  if (!table || table.length === 0) {
    // fallback: cilindro
    return (level: number) => AREA * level * 1000;
  }
  const sorted = [...table].sort((a, b) => a.level - b.level);
  return (level: number): number => {
    if (level <= sorted[0].level) return sorted[0].volume; // fora da tabela: mais próximo
    const last = sorted[sorted.length - 1];
    if (level >= last.level) return last.volume;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (level >= a.level && level <= b.level) {
        const ratio = (level - a.level) / (b.level - a.level);
        return a.volume + ratio * (b.volume - a.volume);
      }
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
// Cenário por tanque: IDLE -> ENCHER -> HOLD -> ESCOAR -> repete
// ---------------------------------------------------------------------------
class TankSim {
  level: number;
  phase: 'idle' | 'fill' | 'hold' | 'drain' = 'fill';
  rate = 0; // velocidade do nível (m/h)
  fillTarget = 0;
  drainTarget = 0;
  phaseRemainingMs = 0;

  constructor(
    private rand: () => number,
    private overflowProne: boolean,
  ) {
    this.level = 0.5 + rand() * 2.5; // estado inicial
    this.pickFillTarget();
    this.rate = (0.6 + rand() * 1.9) / AREA; // 0.6-2.5 m³/h
  }

  private pickFillTarget(): void {
    // FK-02/FK-05: ~1 a cada 3-5 ciclos passa de 4.6m (overflow real)
    if (this.overflowProne && this.rand() < 0.25) {
      this.fillTarget = Math.min(4.65 + this.rand() * 0.2, MAX_LEVEL);
    } else {
      this.fillTarget = Math.min(3.6 + this.rand() * 1.15, MAX_LEVEL);
    }
  }

  /** Avança o passo e devolve o nível base do tanque. */
  step(dtMs: number): number {
    let remaining = dtMs;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 100) {
      if (this.phase === 'fill') {
        const dh = this.rate * (remaining / 3600000);
        if (this.level + dh >= this.fillTarget) {
          remaining -= ((this.fillTarget - this.level) / this.rate) * 3600000;
          this.level = this.fillTarget;
          this.phase = 'hold';
          this.phaseRemainingMs = (1 + this.rand() * 2) * 3600000; // HOLD 1-3h
        } else {
          this.level += dh;
          remaining = 0;
        }
      } else if (this.phase === 'hold') {
        if (remaining >= this.phaseRemainingMs) {
          remaining -= this.phaseRemainingMs;
          this.phase = 'drain';
          this.rate = (2.5 + this.rand() * 1.5) / AREA; // 2.5-4 m³/h
          this.drainTarget = 0.35 + this.rand() * 0.75; // até 0.35-1.1m
        } else {
          this.phaseRemainingMs -= remaining;
          remaining = 0;
        }
      } else if (this.phase === 'drain') {
        const dh = this.rate * (remaining / 3600000);
        if (this.level - dh <= this.drainTarget) {
          remaining -= ((this.level - this.drainTarget) / this.rate) * 3600000;
          this.level = this.drainTarget;
          this.phase = 'idle';
          this.phaseRemainingMs = this.rand() * 4 * 3600000; // IDLE 0-4h
        } else {
          this.level -= dh;
          remaining = 0;
        }
      } else {
        // idle
        if (remaining >= this.phaseRemainingMs) {
          remaining -= this.phaseRemainingMs;
          this.phase = 'fill';
          this.pickFillTarget();
          this.rate = (0.6 + this.rand() * 1.9) / AREA;
        } else {
          this.phaseRemainingMs -= remaining;
          remaining = 0;
        }
      }
    }
    return this.level;
  }
}

// ---------------------------------------------------------------------------
// Alertas históricos (a partir das leituras da haste de nível, com cooldown de 2h)
// ---------------------------------------------------------------------------
interface ThresholdHit {
  type: AlertRow['type'];
  severity: AlertRow['severity'];
  title: string;
  message: (level: number, threshold: number) => string;
  threshold: number;
}

function evaluateThresholds(
  tank: TankInfo,
  level: number,
): ThresholdHit | null {
  // Most severe first, same order and severities as the live alarms
  // (src/modules/alerts/level-alarms.ts): overflow > minimum > high > low.
  // Texts match AlertsService; the console localizes them by alert type.
  if (level >= tank.overflowThreshold) {
    return {
      type: 'overflow_risk',
      severity: 'critical',
      title: 'Overflow Risk',
      message: (l, thr) =>
        `Critical overflow risk! Current level: ${l.toFixed(2)}m, limit: ${thr.toFixed(2)}m`,
      threshold: tank.overflowThreshold,
    };
  }
  if (level <= tank.minThreshold) {
    return {
      type: 'low_level',
      severity: 'high',
      title: 'Low Level Detected',
      message: (l, thr) =>
        `Tank level reached ${l.toFixed(2)}m, at or below its alarm limit of ${thr.toFixed(2)}m`,
      threshold: tank.minThreshold,
    };
  }
  if (level >= tank.maxThreshold) {
    return {
      type: 'high_level',
      severity: 'medium',
      title: 'High Level Detected',
      message: (l, thr) =>
        `Tank level reached ${l.toFixed(2)}m, at or above its alarm limit of ${thr.toFixed(2)}m`,
      threshold: tank.maxThreshold,
    };
  }
  if (level <= tank.lowThreshold) {
    return {
      type: 'low_level',
      severity: 'medium',
      title: 'Low Level Detected',
      message: (l, thr) =>
        `Tank level reached ${l.toFixed(2)}m, at or below its alarm limit of ${thr.toFixed(2)}m`,
      threshold: tank.lowThreshold,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const startedAt = Date.now();
  const totalSteps = Math.floor((DAYS * 24 * 3600 * 1000) / STEP_MS);
  const endMs = Math.floor(Date.now() / STEP_MS) * STEP_MS;
  const startMs = endMs - totalSteps * STEP_MS;
  const activeCutoffMs = endMs - ACTIVE_WINDOW_MS;

  console.log(`Backfill: ${DAYS} dias, step ${STEP_MINUTES} min, seed ${SEED}`);
  console.log(
    `Período: ${new Date(startMs).toISOString()} -> ${new Date(endMs).toISOString()} (${totalSteps} passos/sensor)`,
  );
  if (ROLLBACK_MODE) {
    console.log('Modo ensaio (BACKFILL_ROLLBACK=1): nada será persistido.');
  }

  // Same resolution as the API: DB_*, then DATABASE_URL, then PG*.
  const db = resolveDbEnv((key) => process.env[key]);
  const client = new Client({
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.username,
    password: db.password,
    ssl: db.ssl,
  });
  await client.connect();

  try {
    // ---- Trava de segurança ----------------------------------------------
    const countRes = await client.query<{ n: string }>(
      'SELECT count(*)::int AS n FROM readings',
    );
    const existing = countRes.rows[0].n;
    if (existing > 10000 && !FORCE) {
      console.error(
        `ABORTADO: readings já possui ${existing} linhas (> 10000). ` +
          `Use FORCE_BACKFILL=1 para prosseguir mesmo assim. Nada foi alterado.`,
      );
      return;
    }
    console.log(`readings antes do backfill: ${existing} linhas`);

    // ---- Carga de tanques/sensores ---------------------------------------
    const tankRes = await client.query<any>(
      `SELECT id, code, "arqueacaoTable" AS arqueacao,
              "maxLevelThreshold" AS max_thr, "minLevelThreshold" AS min_thr,
              "overflowThreshold" AS overflow_thr, "lowLevelThreshold" AS low_thr
         FROM tanks
        WHERE status = 'active'
        ORDER BY code`,
    );
    const tanks: TankInfo[] = tankRes.rows.map((r: any) => ({
      id: r.id,
      code: r.code,
      arqueacao: r.arqueacao ?? null,
      maxThreshold: parseFloat(r.max_thr),
      minThreshold: parseFloat(r.min_thr),
      overflowThreshold: parseFloat(r.overflow_thr),
      lowThreshold: parseFloat(r.low_thr),
      gauge: null,
    }));

    const sensorRes = await client.query<any>(
      `SELECT id, "sensorId", "tankId", type::text AS type
         FROM sensors
        WHERE status = 'active'
        ORDER BY "sensorId"`,
    );
    const tankById = new Map(tanks.map((t) => [t.id, t]));
    for (const s of sensorRes.rows) {
      const tank = tankById.get(s.tankId);
      if (!tank) continue; // sensor de tanque fora do backfill (ex.: FK-06)
      if (s.type === 'float_switch') continue; // chave pontual, sem nível contínuo
      // um sensor por tanque; a haste magnetostritiva tem prioridade
      if (!tank.gauge || (s.type === 'magnetostrictive' && tank.gaugeType !== 'magnetostrictive')) {
        tank.gauge = { id: s.id, sensorId: s.sensorId };
        tank.gaugeType = s.type;
      }
    }

    const activeTanks = tanks.filter((t) => t.gauge);
    console.log(
      `Tanques ativos: ${activeTanks.map((t) => t.code).join(', ')}` +
        ` (${activeTanks.length} sensores; tanques em manutenção e sensores inativos excluídos)`,
    );

    // ---- Geração das leituras + COPY -------------------------------------
    const COPY_SQL =
      'COPY readings (id, "sensorId", level, volume, "oilWaterInterface", metadata, quality, ' +
      '"isCalibrated", "isProcessed", "timestamp", "processedAt", "createdAt") FROM STDIN';

    await client.query('BEGIN');
    let lines: string[] = [];
    let insertedTotal = 0;
    const insertedByTank = new Map<string, number>();
    const alerts: AlertRow[] = [];

    const flush = async (): Promise<void> => {
      if (lines.length === 0) return;
      const payload = lines.join('\n') + '\n';
      await copyFromText(client, COPY_SQL, payload);
      insertedTotal += lines.length;
      if (!ROLLBACK_MODE) {
        // Commit a cada ~20k linhas (no modo ensaio mantém tudo numa transação
        // revertível)
        await client.query('COMMIT');
        await client.query('BEGIN');
      }
      lines = [];
      console.log(`  ... ${insertedTotal} leituras copiadas`);
    };

    for (let tankIdx = 0; tankIdx < activeTanks.length; tankIdx++) {
      const tank = activeTanks[tankIdx];
      const rand = mulberry32((SEED + tankIdx * 7919) >>> 0); // PRNG por tanque
      const sim = new TankSim(
        rand,
        tank.code === 'FK-02' || tank.code === 'FK-05',
      );
      const levelToVolume = makeLevelToVolume(tank.arqueacao);
      const sensors: SensorInfo[] = [tank.gauge!];
      const lastAlertAt = new Map<string, number>(); // cooldown por tipo
      let tankRows = 0;

      for (let i = 0; i < totalSteps; i++) {
        const tMs = startMs + i * STEP_MS;
        const tIso = new Date(tMs).toISOString();
        const baseLevel = sim.step(STEP_MS);
        let gaugeLevel = 0;
        let gaugeVolume = 0;

        for (const sensor of sensors) {
          // nível com ruído ±3mm
          let level = baseLevel + (rand() - 0.5) * 0.006;
          level =
            Math.round(Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, level)) * 1000) /
            1000;
          const volume = Math.round(levelToVolume(level) * 1000) / 1000;
          gaugeLevel = level;
          gaugeVolume = volume;

          // qualidade: 90-100, 0.5% das vezes 55-70
          const quality = rand() < 0.005 ? 55 + rand() * 15 : 90 + rand() * 10;

          // metadata do sensor
          const signal = -Math.round(50 + rand() * 50); // -50..-100
          const temperature = (22 + rand() * 12).toFixed(1); // 22-34
          const humidity = (40 + rand() * 45).toFixed(1); // 40-85
          const metadata = `{"signalStrength":${signal},"temperature":${temperature},"humidity":${humidity}}`;

          // interface óleo/água da boia de interface (mesma haste): flowback é
          // majoritariamente água — fração 0.60 -> 0.80 ao longo do período.
          // oil/water são espessuras; interfaceLevel é a altura a partir do fundo.
          let iface = '\\N';
          if (level >= 0.3) {
            const frac =
              0.6 +
              0.2 * (i / Math.max(totalSteps - 1, 1)) +
              (rand() - 0.5) * 0.01;
            const waterMm = Math.round(level * 1000 * frac);
            const water = waterMm / 1000;
            const oil = (Math.round(level * 1000) - waterMm) / 1000;
            iface = copyEscape(
              `{"oilLevel":${oil.toFixed(3)},"waterLevel":${water.toFixed(3)},"interfaceLevel":${water.toFixed(3)}}`,
            );
          }

          lines.push(
            [
              randomUUID(),
              sensor.id,
              level.toFixed(3),
              volume.toFixed(3),
              iface,
              copyEscape(metadata),
              quality.toFixed(2),
              't',
              't',
              tIso,
              tIso,
              tIso,
            ].join('\t'),
          );
          tankRows++;
          if (lines.length >= COMMIT_EVERY) await flush();
        }

        // alertas derivados da leitura efetivamente gravada pela haste
        const hit = evaluateThresholds(tank, gaugeLevel);
        if (hit) {
          const last = lastAlertAt.get(hit.type) ?? -Infinity;
          if (tMs - last >= COOLDOWN_MS) {
            lastAlertAt.set(hit.type, tMs);
            const isActive = tMs >= activeCutoffMs;
            alerts.push({
              id: randomUUID(),
              tankId: tank.id,
              type: hit.type,
              severity: hit.severity,
              status: isActive ? 'active' : 'resolved',
              title: hit.title,
              message: hit.message(gaugeLevel, hit.threshold),
              currentLevel: gaugeLevel.toFixed(3),
              currentVolume: gaugeVolume.toFixed(3),
              thresholdValue: hit.threshold.toFixed(3),
              sensorId: tank.gauge!.id,
              resolvedAt: isActive
                ? null
                : new Date(tMs + (30 + rand() * 60) * 60 * 1000).toISOString(), // +30-90min
              resolutionNotes: isActive
                ? null
                : 'Nível normalizado após escoamento',
              createdAt: tIso,
              updatedAt: tIso,
            });
          }
        }
      }
      insertedByTank.set(tank.code, tankRows);
      console.log(`Tanque ${tank.code}: ${tankRows} leituras geradas`);
    }
    await flush(); // restante

    // ---- INSERT dos alertas (chunks de 500 VALUES) ------------------------
    let insertedAlerts = 0;
    for (let off = 0; off < alerts.length; off += ALERT_CHUNK) {
      const chunk = alerts.slice(off, off + ALERT_CHUNK);
      const valuesSql: string[] = [];
      const params: any[] = [];
      chunk.forEach((a, idx) => {
        const p = idx * 15;
        valuesSql.push(
          `($${p + 1},$${p + 2},$${p + 3},$${p + 4},$${p + 5},$${p + 6},$${p + 7},` +
            `$${p + 8},$${p + 9},$${p + 10},$${p + 11},$${p + 12},$${p + 13},$${p + 14},$${p + 15})`,
        );
        params.push(
          a.id,
          a.tankId,
          a.type,
          a.severity,
          a.status,
          a.title,
          a.message,
          a.currentLevel,
          a.currentVolume,
          a.thresholdValue,
          a.sensorId,
          a.resolvedAt,
          a.resolutionNotes,
          a.createdAt,
          a.updatedAt, // = createdAt (momento do cruzamento)
        );
      });
      await client.query(
        `INSERT INTO alerts (id, "tankId", type, severity, status, title, message,
             "currentLevel", "currentVolume", "thresholdValue", "sensorId",
             "resolvedAt", "resolutionNotes", "createdAt", "updatedAt")
         VALUES ${valuesSql.join(',')}`,
        params,
      );
      insertedAlerts += chunk.length;
    }

    if (ROLLBACK_MODE) {
      await client.query('ROLLBACK');
      console.log(
        `\nModo ensaio: ROLLBACK executado. ${insertedTotal} leituras e ${insertedAlerts} alertas gerados mas NÃO persistidos.`,
      );
      return;
    }

    await client.query('COMMIT');
    console.log(
      `\nCommit final: ${insertedTotal} leituras, ${insertedAlerts} alertas.`,
    );

    // ---- Refresh dos agregados contínuos ----------------------------------
    for (const view of ['readings_5m', 'readings_1h']) {
      try {
        const bucket = view === 'readings_5m' ? '5 minutes' : '1 hour';
        await client.query(
          `CALL refresh_continuous_aggregate('${view}', NULL, time_bucket(INTERVAL '${bucket}', now()))`,
        );
        console.log(`refresh_continuous_aggregate('${view}') OK`);
      } catch (e: any) {
        console.log(
          `refresh_continuous_aggregate('${view}') ignorado: ${e.message}`,
        );
      }
    }

    // ---- Resumo ------------------------------------------------------------
    const durationS = ((Date.now() - startedAt) / 1000).toFixed(1);
    const post = await client.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM readings) AS readings,
              (SELECT count(*) FROM readings_5m) AS r5m,
              (SELECT count(*) FROM readings_1h) AS r1h,
              (SELECT count(*) FROM alerts) AS alerts`,
    );
    // Plain PostgreSQL (no TimescaleDB, e.g. a hosted demo) has no chunks.
    const chunks = await client
      .query<{ n: string }>(
        `SELECT count(*) AS n FROM timescaledb_information.chunks WHERE hypertable_name = 'readings'`,
      )
      .catch(() => ({ rows: [{ n: 'n/a (sem TimescaleDB)' }] }));
    const alertTypes = await client.query<any>(
      `SELECT type, severity, count(*)::int AS n FROM alerts GROUP BY type, severity ORDER BY type, severity`,
    );

    console.log('\n=== BACKFILL CONCLUÍDO ===');
    console.log(`Leituras inseridas: ${insertedTotal}`);
    for (const t of activeTanks) {
      const note =
        t.code === 'FK-02' || t.code === 'FK-05'
          ? ' (com ciclos de overflow)'
          : '';
      console.log(`  ${t.code}: ${insertedByTank.get(t.code)}${note}`);
    }
    console.log(`Alertas inseridos: ${insertedAlerts}`);
    for (const row of alertTypes.rows) {
      console.log(`  ${row.type} / ${row.severity}: ${row.n}`);
    }
    console.log(`Duração: ${durationS}s`);
    console.log(
      `Counts pós-refresh: readings=${post.rows[0].readings}, readings_5m=${post.rows[0].r5m}, readings_1h=${post.rows[0].r1h}, alerts=${post.rows[0].alerts}`,
    );
    console.log(`Chunks da hypertable readings: ${chunks.rows[0].n}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Falha no backfill:', err);
  process.exit(1);
});
