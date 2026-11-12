import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  RefreshCw,
  Radio,
  AlertTriangle,
  Inbox,
  LineChart,
} from "lucide-react";
import { apiService } from "../services/api";
import { currentLocale } from "../i18n";
import { Reading, ReadingEventPayload, Sensor, Tank } from "../types";
import { useWebSocketEvent } from "../hooks/useWebSocketEvent";
import LoadingSpinner from "../components/common/LoadingSpinner";
import TimeseriesChart, {
  ChartPoint,
  decimateSeries,
} from "../components/readings/TimeseriesChart";
import StatsStrip, { PeriodStats } from "../components/readings/StatsStrip";
import RawReadingsTable from "../components/readings/RawReadingsTable";

type PeriodKey = "24h" | "7d" | "30d" | "90d";
type GranKey = "5m" | "1h";

const PERIOD_MS: Record<PeriodKey, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
  "90d": 90 * 24 * 3600_000,
};

const PERIOD_HOURS: Record<PeriodKey, number> = {
  "24h": 24,
  "7d": 168,
  "30d": 720,
  "90d": 2160,
};

const PERIOD_LABEL_KEYS: Record<PeriodKey, string> = {
  "24h": "readings.period24h",
  "7d": "readings.period7d",
  "30d": "readings.period30d",
  "90d": "readings.period90d",
};

const GRAN_LABEL_KEYS: Record<GranKey, string> = {
  "5m": "readings.gran5m",
  "1h": "readings.gran1h",
};

/** Períodos longos não combinam com granularidade fina (limite prático de pontos) */
const FINE_GRAN_MAX_PERIOD: PeriodKey = "7d";

const MAX_CHART_POINTS = 800;
const MAX_API_LIMIT = 3000;

/** "SENSOR-004" → 4 */
function sensorNumber(s: Sensor): number {
  const m = /(\d+)\s*$/.exec(s.sensorId);
  return m ? Number(m[1]) : 0;
}

/** Haste de duas boias reporta a interface óleo/água junto com o nível */
function isInterfaceSensor(s: Sensor | undefined): boolean {
  if (!s) return false;
  return s.type === "magnetostrictive" || /interface/i.test(s.name);
}

/** "Float Stick — Level & Interface (FK-01)" → "Float Stick" */
function sensorRole(s: Sensor): string {
  const part = s.name.split("—")[0]?.trim();
  return part || s.sensorId;
}

const Readings: React.FC = () => {
  const { t } = useTranslation();

  // ---- Filtros ----
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [tankId, setTankId] = useState<string>("");
  const [sensorId, setSensorId] = useState<string>("");
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [gran, setGran] = useState<GranKey>("1h");

  // ---- Dados ----
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [apiCount, setApiCount] = useState(0);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [viewName, setViewName] = useState<string>("");
  const [rawReadings, setRawReadings] = useState<Reading[]>([]);

  // ---- Estados de UI ----
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState(false);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState(false);
  const [liveCount, setLiveCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const reqIdRef = useRef(0);

  const selectedTank = tanks.find((tank) => tank.id === tankId);
  const selectedSensor = sensors.find((s) => s.id === sensorId);
  const tankSensors = useMemo(
    () =>
      sensors
        .filter((s) => s.tankId === tankId)
        .sort((a, b) => sensorNumber(a) - sensorNumber(b)),
    [sensors, tankId],
  );

  // ---- Carga inicial: tanques + sensores (default FK-01) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setInitLoading(true);
        setInitError(false);
        const [tanksData, sensorsData] = await Promise.all([
          apiService.getTanks(),
          apiService.getSensors(),
        ]);
        if (cancelled) return;
        setTanks(tanksData);
        setSensors(sensorsData);
        const defaultTank =
          tanksData.find((tank) => tank.code === "FK-01") ?? tanksData[0];
        if (defaultTank) setTankId(defaultTank.id);
      } catch (err) {
        console.error("Readings init error:", err);
        if (!cancelled) setInitError(true);
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Ao trocar de tanque: seleciona o primeiro sensor do tanque ----
  useEffect(() => {
    const first = sensors
      .filter((s) => s.tankId === tankId)
      .sort((a, b) => sensorNumber(a) - sensorNumber(b))[0];
    setSensorId(first ? first.id : "");
  }, [tankId, sensors]);

  // ---- Série temporal + leituras crus (por filtro/refresh) ----
  useEffect(() => {
    if (!sensorId) {
      setChartData([]);
      setApiCount(0);
      setRawReadings([]);
      return;
    }

    const reqId = ++reqIdRef.current;
    const from = new Date(Date.now() - PERIOD_MS[period]).toISOString();
    const pointsPerHour = gran === "5m" ? 12 : 1;
    const expected = PERIOD_HOURS[period] * pointsPerHour;
    const limit = Math.min(MAX_API_LIMIT, Math.ceil(expected * 1.05) + 50);

    // Série agregada (TimescaleDB)
    (async () => {
      try {
        setChartLoading(true);
        setChartError(false);
        const t0 = performance.now();
        const res = await apiService.getTimeseries({
          sensorId,
          bucket: gran,
          from,
          limit,
        });
        const elapsed = performance.now() - t0;
        if (reqId !== reqIdRef.current) return;

        const points = (res.series ?? [])
          .filter((s: any) => s.avg_level != null)
          .map(
            (s: any): ChartPoint => ({
              t: new Date(s.bucket).getTime(),
              avg: s.avg_level,
              min: s.min_level ?? s.avg_level,
              max: s.max_level ?? s.avg_level,
              volume: s.avg_volume ?? null,
              quality: s.avg_quality ?? null,
              oil: s.avg_oil_level ?? null,
              water: s.avg_water_level ?? null,
              count: s.sample_count ?? 0,
            }),
          )
          .sort((a, b) => a.t - b.t);

        setChartData(points);
        setApiCount(res.count ?? points.length);
        setQueryMs(Math.round(elapsed * 10) / 10);
        setViewName(res.view ?? "");
      } catch (err: any) {
        console.error("Timeseries error:", err);
        if (reqId !== reqIdRef.current) return;
        setChartData([]);
        setChartError(true);
      } finally {
        if (reqId === reqIdRef.current) setChartLoading(false);
      }
    })();

    // Leituras crus (últimas 10)
    (async () => {
      try {
        setRawLoading(true);
        setRawError(false);
        const readings = await apiService.getLatestReadings(sensorId, 10);
        if (reqId !== reqIdRef.current) return;
        setRawReadings(readings);
      } catch (err: any) {
        console.error("Raw readings error:", err);
        if (reqId !== reqIdRef.current) return;
        setRawReadings([]);
        setRawError(true);
      } finally {
        if (reqId === reqIdRef.current) setRawLoading(false);
      }
    })();
  }, [sensorId, period, gran, refreshKey]);

  // ---- Ao vivo: contador de leituras do sensor selecionado ----
  useWebSocketEvent<ReadingEventPayload>("reading", (payload) => {
    if (payload?.sensorId && payload.sensorId === selectedSensor?.sensorId) {
      setLiveCount((c) => c + 1);
    }
  });

  // ---- Derivados ----
  const chartPoints = useMemo(
    () => decimateSeries(chartData, MAX_CHART_POINTS),
    [chartData],
  );
  const wasDecimated = chartData.length > chartPoints.length;

  const stats: PeriodStats | null = useMemo(() => {
    if (chartData.length === 0) return null;
    let sumLevel = 0;
    let sumVolume = 0;
    let volumeCount = 0;
    let maxLevel = -Infinity;
    let minLevel = Infinity;
    let samples = 0;
    for (const p of chartData) {
      sumLevel += p.avg;
      if (p.max > maxLevel) maxLevel = p.max;
      if (p.min < minLevel) minLevel = p.min;
      if (p.volume != null) {
        sumVolume += p.volume;
        volumeCount++;
      }
      samples += p.count;
    }
    return {
      avgLevel: sumLevel / chartData.length,
      maxLevel,
      minLevel,
      avgVolume: volumeCount > 0 ? sumVolume / volumeCount : NaN,
      samples,
    };
  }, [chartData]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const handlePeriodChange = (value: PeriodKey) => {
    setPeriod(value);
    // 5 min só é viável em períodos curtos — ajusta para 1h automaticamente
    if (gran === "5m") {
      const order: PeriodKey[] = ["24h", "7d", "30d", "90d"];
      if (order.indexOf(value) > order.indexOf(FINE_GRAN_MAX_PERIOD)) {
        setGran("1h");
      }
    }
  };

  // ---- Render ----
  if (initLoading) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">
          {t("readings.heading")}
        </h1>
        <div className="card">
          <div className="card-content py-20">
            <LoadingSpinner size="large" />
            <p className="text-center text-sm text-muted-foreground mt-4">
              {t("readings.loading")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="space-y-8">
        <h1 className="text-3xl font-bold text-foreground">
          {t("readings.heading")}
        </h1>
        <div className="card">
          <div className="card-content flex flex-col items-center py-16 text-center">
            <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
            <p className="text-foreground font-medium mb-1">
              {t("readings.initError")}
            </p>
            <button
              className="btn btn-primary mt-4"
              onClick={() => window.location.reload()}
            >
              {t("common.reload")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">
          {t("readings.heading")}
        </h1>
        <p className="text-muted-foreground mt-2">{t("readings.sub")}</p>
      </div>

      {/* Barra de controles */}
      <div className="card">
        <div className="card-content py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("readings.tank")}
              </label>
              <select
                aria-label={t("readings.tankAria")}
                className="input"
                value={tankId}
                onChange={(e) => setTankId(e.target.value)}
              >
                {tanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.code} — {tank.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("readings.sensor")}
              </label>
              <select
                aria-label={t("readings.sensorAria")}
                className="input"
                value={sensorId}
                onChange={(e) => setSensorId(e.target.value)}
                disabled={tankSensors.length === 0}
              >
                {tankSensors.length === 0 && (
                  <option value="">{t("readings.noSensors")}</option>
                )}
                {tankSensors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sensorId} — {sensorRole(s)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("readings.period")}
              </label>
              <select
                aria-label={t("readings.periodAria")}
                className="input"
                value={period}
                onChange={(e) =>
                  handlePeriodChange(e.target.value as PeriodKey)
                }
              >
                {(Object.keys(PERIOD_MS) as PeriodKey[]).map((p) => (
                  <option key={p} value={p}>
                    {t(PERIOD_LABEL_KEYS[p])}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                {t("readings.granularity")}
              </label>
              <select
                aria-label={t("readings.granularityAria")}
                className="input"
                value={gran}
                onChange={(e) => setGran(e.target.value as GranKey)}
              >
                <option
                  value="5m"
                  disabled={(() => {
                    const order: PeriodKey[] = ["24h", "7d", "30d", "90d"];
                    return (
                      order.indexOf(period) >
                      order.indexOf(FINE_GRAN_MAX_PERIOD)
                    );
                  })()}
                >
                  {t("readings.gran5m")}
                </option>
                <option value="1h">{t("readings.gran1h")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="card">
        <div className="card-content">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <LineChart className="h-5 w-5 text-primary" />
                {t("readings.chartTitle", {
                  code: selectedTank?.code ?? "…",
                  period: t(PERIOD_LABEL_KEYS[period]),
                  gran: t(GRAN_LABEL_KEYS[gran]),
                })}
              </h2>
              {selectedSensor && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {selectedSensor.sensorId} — {selectedSensor.name}
                </p>
              )}
            </div>

            {/* Ao vivo */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <span className="relative flex h-2.5 w-2.5">
                  {liveCount > 0 && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      liveCount > 0 ? "bg-green-500" : "bg-gray-400"
                    }`}
                  />
                </span>
                <Radio className="h-4 w-4" />
                <span className="tabular-nums font-semibold text-foreground">
                  {liveCount}
                </span>
                {t("readings.liveSince")}
              </span>
              <button
                className="btn btn-secondary inline-flex items-center gap-1.5"
                onClick={handleRefresh}
                disabled={chartLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${chartLoading ? "animate-spin" : ""}`}
                />
                {t("common.refresh")}
              </button>
            </div>
          </div>

          {chartError ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
              <p className="text-foreground font-medium mb-1">
                {t("readings.chartError")}
              </p>
              <button className="btn btn-primary mt-4" onClick={handleRefresh}>
                {t("common.tryAgain")}
              </button>
            </div>
          ) : chartLoading ? (
            <div className="animate-pulse space-y-3" style={{ height: 360 }}>
              <div className="h-full w-full rounded bg-muted" />
            </div>
          ) : chartPoints.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-16 text-center"
              style={{ minHeight: 280 }}
            >
              <Inbox className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-foreground font-medium">
                {t("readings.chartEmpty")}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {t("readings.chartEmptyHint")}
              </p>
            </div>
          ) : (
            <>
              <TimeseriesChart
                data={chartPoints}
                referenceData={chartData}
                intervalMs={gran === "5m" ? 300000 : 3600000}
                showInterface={isInterfaceSensor(selectedSensor)}
              />
              <p className="text-xs text-muted-foreground mt-3 flex flex-wrap items-center gap-x-1.5">
                <Database className="h-3.5 w-3.5" />
                {t("readings.timescaleLine", { count: apiCount })}
                {wasDecimated &&
                  ` ${t("readings.decimated", { count: chartPoints.length })}`}
                {queryMs != null && ` ${t("readings.inMs", { ms: fmtMs(queryMs) })}`}
                {viewName && ` ${t("readings.viewLabel", { view: viewName })}`}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Mini-estatísticas do período */}
      <StatsStrip
        stats={stats}
        loading={chartLoading && chartData.length === 0}
      />

      {/* Leituras crus */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t("readings.rawTitle")}</h3>
          <p className="card-description">
            {t("readings.rawDesc", {
              sensor: selectedSensor ? selectedSensor.sensorId : "—",
            })}
          </p>
        </div>
        <div className="card-content">
          {rawError ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t("readings.rawError")}
            </div>
          ) : (
            <RawReadingsTable readings={rawReadings} loading={rawLoading} />
          )}
        </div>
      </div>
    </div>
  );
};

function fmtMs(ms: number): string {
  return ms >= 100
    ? `${Math.round(ms)} ms`
    : `${ms.toLocaleString(currentLocale(), { maximumFractionDigits: 1 })} ms`;
}

export default Readings;
