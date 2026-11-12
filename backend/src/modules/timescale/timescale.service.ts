import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Bootstrap do TimescaleDB sobre a tabela `readings`:
 *
 * 1. EXTENSION timescaledb
 * 2. Hypertable particionada por "timestamp" (chunks de 1 dia)
 *    — a PK única em `id` é substituída por (id, "timestamp"), exigência do
 *      Timescale para índices únicos em hypertables.
 * 3. Agregados contínuos readings_5m e readings_1h (real-time: mesclam o
 *    histórico materializado com as leituras crus mais recentes).
 * 4. Políticas: refresh dos agregados, retenção de 180 dias (dado cru) e
 *    compressão de chunks com mais de 14 dias.
 *
 * Tudo idempotente: pode rodar em todo boot sem efeito colateral.
 *
 * Sem a extensão (ex.: Postgres gerenciado do Railway), cria views simples
 * com as mesmas colunas para o /readings/timeseries continuar funcionando.
 */
@Injectable()
export class TimescaleService implements OnModuleInit {
  private readonly logger = new Logger(TimescaleService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.step(
        'extension',
        'CREATE EXTENSION IF NOT EXISTS timescaledb',
      );
      await this.setupHypertable();
      await this.setupContinuousAggregates();
      await this.setupPolicies();
      this.logger.log(
        'TimescaleDB pronto: hypertable readings + agregados 5m/1h + políticas',
      );
    } catch (error) {
      // Não derruba a aplicação: loga e segue (ex.: imagem postgres sem timescale)
      this.logger.error('Falha ao configurar TimescaleDB (não fatal):', error);
      try {
        await this.setupPlainFallbackViews();
      } catch (fallbackError) {
        this.logger.error(
          'Fallback de views simples também falhou:',
          fallbackError,
        );
      }
    }
  }

  /** Executa um passo de setup tratando "already exists" como sucesso. */
  private async step(name: string, sql: string): Promise<void> {
    try {
      await this.dataSource.query(sql);
      this.logger.debug(`Timescale [${name}] ok`);
    } catch (error: any) {
      const message = String(error?.message ?? error);
      if (/already exists|duplicate|is already a hypertable/i.test(message)) {
        this.logger.debug(`Timescale [${name}] já configurado`);
        return;
      }
      this.logger.warn(`Timescale [${name}] falhou: ${message}`);
      throw error;
    }
  }

  /**
   * Fallback para Postgres sem TimescaleDB: views comuns com as mesmas
   * colunas dos agregados contínuos, calculadas a cada consulta. Servem o
   * /readings/timeseries em escala de demonstração, sem compressão/retenção.
   */
  private async setupPlainFallbackViews(): Promise<void> {
    for (const [view, seconds] of [
      ['readings_5m', 300],
      ['readings_1h', 3600],
    ] as const) {
      await this.dataSource.query(`CREATE OR REPLACE VIEW ${view} AS
        SELECT
          to_timestamp(floor(extract(epoch from "timestamp") / ${seconds}) * ${seconds}) AS bucket,
          "sensorId",
          avg(level) AS avg_level,
          max(level) AS max_level,
          min(level) AS min_level,
          avg(volume) AS avg_volume,
          max(volume) AS max_volume,
          avg(("oilWaterInterface"->>'oilLevel')::numeric) AS avg_oil_level,
          avg(("oilWaterInterface"->>'waterLevel')::numeric) AS avg_water_level,
          avg(quality) AS avg_quality,
          count(*) AS sample_count
        FROM readings
        GROUP BY 1, "sensorId"`);
    }
    this.logger.warn(
      'TimescaleDB indisponível: usando views simples readings_5m/readings_1h (sem compressão, retenção ou agregados contínuos)',
    );
  }

  private async setupHypertable(): Promise<void> {
    const hypertable = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM timescaledb_information.hypertables
       WHERE hypertable_name = 'readings'`,
    );
    if (hypertable?.[0]?.n > 0) {
      this.logger.debug('readings já é hypertable');
      return;
    }

    // Índices únicos em hypertable precisam conter a coluna de particionamento.
    // A constraint recebe exatamente o nome que o synchronize do TypeORM espera
    // (senão ele tenta recriar a PK a cada boot e o Timescale rejeita).
    const constraints = await this.dataSource.query(
      `SELECT c.conname, array_agg(a.attname ORDER BY k.ord) AS cols
       FROM pg_constraint c
       JOIN unnest(c.conkey) WITH ORDINALITY k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
       WHERE c.conrelid = 'readings'::regclass AND c.contype = 'p'
       GROUP BY c.conname`,
    );
    const pk = constraints?.[0];
    const expectedCols = ['id', 'timestamp'];
    if (!pk || JSON.stringify(pk.cols) !== JSON.stringify(expectedCols)) {
      const pkName = this.dataSource.namingStrategy.primaryKeyName(
        'readings',
        expectedCols,
      );
      if (pk) {
        await this.dataSource.query(
          `ALTER TABLE readings DROP CONSTRAINT "${pk.conname}"`,
        );
      }
      await this.dataSource.query(
        `ALTER TABLE readings ADD CONSTRAINT "${pkName}" PRIMARY KEY (id, "timestamp")`,
      );
      this.logger.log(
        `PK de readings ajustada para (id, "timestamp") [${pkName}]`,
      );
    }

    await this.step(
      'create_hypertable',
      `SELECT create_hypertable('readings', 'timestamp',
         chunk_time_interval => INTERVAL '1 day',
         migrate_data => true,
         if_not_exists => true)`,
    );
  }

  private async setupContinuousAggregates(): Promise<void> {
    await this.step(
      'cagg readings_5m',
      `CREATE MATERIALIZED VIEW IF NOT EXISTS readings_5m
       WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
       SELECT
         time_bucket(INTERVAL '5 minutes', "timestamp") AS bucket,
         "sensorId",
         avg(level) AS avg_level,
         max(level) AS max_level,
         min(level) AS min_level,
         avg(volume) AS avg_volume,
         max(volume) AS max_volume,
         avg(("oilWaterInterface"->>'oilLevel')::numeric) AS avg_oil_level,
         avg(("oilWaterInterface"->>'waterLevel')::numeric) AS avg_water_level,
         avg(quality) AS avg_quality,
         count(*) AS sample_count
       FROM readings
       GROUP BY bucket, "sensorId"
       WITH NO DATA`,
    );

    await this.step(
      'cagg readings_1h',
      `CREATE MATERIALIZED VIEW IF NOT EXISTS readings_1h
       WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
       SELECT
         time_bucket(INTERVAL '1 hour', "timestamp") AS bucket,
         "sensorId",
         avg(level) AS avg_level,
         max(level) AS max_level,
         min(level) AS min_level,
         avg(volume) AS avg_volume,
         max(volume) AS max_volume,
         avg(("oilWaterInterface"->>'oilLevel')::numeric) AS avg_oil_level,
         avg(("oilWaterInterface"->>'waterLevel')::numeric) AS avg_water_level,
         avg(quality) AS avg_quality,
         count(*) AS sample_count
       FROM readings
       GROUP BY bucket, "sensorId"
       WITH NO DATA`,
    );

    await this.step(
      'real-time 5m',
      'ALTER MATERIALIZED VIEW readings_5m SET (timescaledb.materialized_only = false)',
    );
    await this.step(
      'real-time 1h',
      'ALTER MATERIALIZED VIEW readings_1h SET (timescaledb.materialized_only = false)',
    );
    // Leave the current bucket unmaterialized so the live tail stays visible.
    await this.step(
      'refresh inicial 5m',
      `CALL refresh_continuous_aggregate('readings_5m', now() - INTERVAL '3 days', time_bucket(INTERVAL '5 minutes', now()))`,
    );
    await this.step(
      'refresh inicial 1h',
      `CALL refresh_continuous_aggregate('readings_1h', now() - INTERVAL '30 days', time_bucket(INTERVAL '1 hour', now()))`,
    );
  }

  private async setupPolicies(): Promise<void> {
    await this.step(
      'policy refresh 5m',
      `SELECT add_continuous_aggregate_policy('readings_5m',
         start_offset => INTERVAL '3 days',
         end_offset => INTERVAL '5 minutes',
         schedule_interval => INTERVAL '5 minutes')`,
    );
    await this.step(
      'policy refresh 1h',
      `SELECT add_continuous_aggregate_policy('readings_1h',
         start_offset => INTERVAL '30 days',
         end_offset => INTERVAL '1 hour',
         schedule_interval => INTERVAL '1 hour')`,
    );
    await this.step(
      'compressão',
      `ALTER TABLE readings SET (
         timescaledb.compress,
         timescaledb.compress_segmentby = '"sensorId"',
         timescaledb.compress_orderby = '"timestamp" DESC')`,
    );
    await this.step(
      'policy compressão',
      `SELECT add_compression_policy('readings', INTERVAL '14 days')`,
    );
    await this.step(
      'policy retenção',
      `SELECT add_retention_policy('readings', INTERVAL '180 days')`,
    );
  }

  /** Diagnóstico usado pelo endpoint de saúde: hypertable? agregados? políticas? */
  async getStatus(): Promise<any> {
    const hypertable = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM timescaledb_information.hypertables
       WHERE hypertable_name = 'readings'`,
    );
    const caggs = await this.dataSource.query(
      `SELECT view_name, materialized_only FROM timescaledb_information.continuous_aggregates`,
    );
    const jobs = await this.dataSource.query(
      `SELECT proc_name, schedule_interval
       FROM timescaledb_information.jobs
       WHERE proc_name LIKE 'policy_%'`,
    );
    const chunks = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM timescaledb_information.chunks
       WHERE hypertable_name = 'readings'`,
    );
    return {
      hypertable: (hypertable?.[0]?.n ?? 0) > 0,
      continuousAggregates: (caggs ?? []).map((c: any) => c.view_name),
      realTimeAggregates: (caggs ?? [])
        .filter((c: any) => !c.materialized_only)
        .map((c: any) => c.view_name),
      policies: jobs ?? [],
      chunks: chunks?.[0]?.n ?? 0,
    };
  }
}
