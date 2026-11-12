import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  Droplets,
  FlaskConical,
  Radio,
  RefreshCw,
  Server,
  Waves,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiService } from "../services/api";
import {
  Alert,
  DashboardStats,
  ReadingEventPayload,
  SystemHealth,
  Tank,
  TankForecast,
} from "../types";
import { useWebSocketEvent } from "../hooks/useWebSocketEvent";
import { useWebSocket } from "../contexts/WebSocketContext";
import { currentLocale } from "../i18n";
import {
  formatElapsed,
  formatHours,
  formatNumber,
  formatTimeOfDay,
  formatFeet,
  formatBarrels,
} from "../utils/format";
import {
  formatCapacityM3,
  formatLevel,
  formatRateMH,
  getUnitSystem,
  levelValue,
  unitSuffixes,
} from "../utils/units.ts";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { withTelemetryGaps } from "../utils/telemetry";

interface ChartPoint {
  t: number;
  level: number;
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Droplets;
  warning?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon
          className={`h-4 w-4 ${warning ? "text-amber-500" : "text-primary"}`}
          strokeWidth={1.7}
        />
      </div>
      <p
        className={`metric-value mt-4 text-3xl font-semibold ${warning ? "text-amber-600 dark:text-amber-400" : ""}`}
      >
        {value}
      </p>
      <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [forecasts, setForecasts] = useState<TankForecast[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertTotal, setAlertTotal] = useState<number | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [partialKeys, setPartialKeys] = useState<string[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [chart, setChart] = useState<ChartPoint[]>([]);
  const [chartState, setChartState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [lastReading, setLastReading] = useState<ReadingEventPayload | null>(
    null,
  );
  const inFlight = useRef(false);
  const { isConnected } = useWebSocket();

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    try {
      const [tankData, sensorData, predictionData, alertData, healthData] =
        await Promise.allSettled([
          apiService.getTanks(),
          apiService.getDashboardStats(),
          apiService.getPredictions(),
          apiService.getAlerts({ status: "active", limit: 4 }),
          apiService.getHealth(),
        ]);
      if (tankData.status === "rejected" || sensorData.status === "rejected")
        throw new Error("dashboard data unavailable");
      const fleet = [...tankData.value].sort((a, b) =>
        a.code.localeCompare(b.code),
      );
      setTanks(fleet);
      setSelectedId(
        (previous) =>
          previous ||
          fleet.find((tank) => tank.status === "active")?.id ||
          fleet[0]?.id ||
          "",
      );
      setStats(sensorData.value);
      setForecasts(
        predictionData.status === "fulfilled" ? predictionData.value : [],
      );
      setAlerts(alertData.status === "fulfilled" ? alertData.value.alerts : []);
      setAlertTotal(
        alertData.status === "fulfilled" ? alertData.value.total : null,
      );
      setHealth(healthData.status === "fulfilled" ? healthData.value : null);
      setPartialKeys(
        [
          predictionData.status === "rejected"
            ? "dashboard.partialPredictions"
            : "",
          alertData.status === "rejected" ? "dashboard.partialAlerts" : "",
          healthData.status === "rejected" ? "dashboard.partialHealth" : "",
        ].filter(Boolean),
      );
      setUpdatedAt(new Date().toISOString());
      setError(false);
    } catch {
      setError(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  // Alertas vêm traduzidos do backend (Accept-Language): troca de idioma
  // refaz a consulta para a lista lateral sair no idioma novo
  useEffect(() => {
    const reload = () => void load();
    i18n.on("languageChanged", reload);
    return () => {
      i18n.off("languageChanged", reload);
    };
  }, [load]);
  useWebSocketEvent<ReadingEventPayload>("reading", (payload) =>
    setLastReading(payload),
  );
  useWebSocketEvent("alert", () => {
    void load();
  });
  useWebSocketEvent("forecast", () => {
    void load();
  });

  const selected = tanks.find((tank) => tank.id === selectedId);
  const byTank = useMemo(
    () => new Map(forecasts.map((f) => [f.tankId, f])),
    [forecasts],
  );
  const selectedForecast = byTank.get(selectedId);
  useEffect(() => {
    if (!selectedId) {
      setChart([]);
      setChartState("ready");
      return;
    }
    let cancelled = false;
    setChartState("loading");
    apiService
      .getTimeseries({
        tankId: selectedId,
        sensorId: selectedForecast?.sensorId,
        bucket: "5m",
        from: new Date(Date.now() - 24 * 3600000).toISOString(),
        limit: 600,
      })
      .then((result) => {
        if (cancelled) return;
        setChart(
          result.series
            .filter((row) => row.avg_level != null)
            .map((row) => ({
              t: new Date(row.bucket).getTime(),
              level: Number(row.avg_level),
            }))
            .filter(
              (row) => Number.isFinite(row.t) && Number.isFinite(row.level),
            )
            .sort((a, b) => a.t - b.t),
        );
        setChartState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setChart([]);
          setChartState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedForecast?.sensorId, updatedAt]);

  const active = tanks.filter((tank) => tank.status === "active").length;
  const capacityM3 =
    tanks.reduce(
      (sum, tank) => sum + (Number(tank.dimensions.volume) || 0),
      0,
    ) / 1000;
  const atRisk = forecasts.filter(
    (f) => f.dataFresh && f.etaOverflowHours != null && f.etaOverflowHours <= 6,
  );

  if (loading)
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3">
        <LoadingSpinner />
        <span className="text-sm text-muted-foreground">
          {t("dashboard.loading")}
        </span>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{t("dashboard.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {t("dashboard.heading")}
            <span className="text-primary">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("dashboard.sub")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <p className="hidden text-[11px] text-muted-foreground sm:block">
              {t("common.updatedAt", { time: formatTimeOfDay(updatedAt) })}
            </p>
          )}
          <button
            type="button"
            onClick={load}
            disabled={refreshing}
            className="btn border border-border bg-card text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            {t("common.refresh")}
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-primary/15 bg-primary/5 px-4 py-2.5 text-xs">
        <span className="flex items-center gap-2 text-primary">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" />
          <span>
            <strong className="font-semibold">{t("common.demoBadge")}</strong>
            <span className="text-muted-foreground">
              {t("common.demoNote")}
            </span>
          </span>
        </span>
        <span className="hidden font-mono text-[10px] text-muted-foreground xl:block">
          NORUSH / OPERATIONS CONSOLE
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <span>
            {t("dashboard.error")}{" "}
            {tanks.length > 0 && t("common.staleData")}
          </span>
          <button
            className="btn border border-destructive/30 text-xs"
            onClick={load}
          >
            {t("common.tryAgain")}
          </button>
        </div>
      )}
      {partialKeys.length > 0 && (
        <p
          role="status"
          className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {t("dashboard.partial", {
            items: partialKeys.map((key) => t(key)).join(", "),
          })}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("dashboard.metricTanks")}
          value={`${active.toString().padStart(2, "0")} / ${tanks.length.toString().padStart(2, "0")}`}
          detail={t("dashboard.metricTanksDetail", {
            count: tanks.filter((tank) => tank.status === "maintenance").length,
          })}
          icon={Droplets}
        />
        <Metric
          label={t("dashboard.metricSensors")}
          value={
            stats ? `${stats.overview.online} / ${stats.overview.active}` : "—"
          }
          detail={t("dashboard.metricSensorsDetail")}
          icon={Radio}
        />
        <Metric
          label={t("dashboard.metricAlerts")}
          value={
            alertTotal == null ? "—" : alertTotal.toString().padStart(2, "0")
          }
          detail={
            alertTotal == null
              ? t("dashboard.metricAlertsUnavailable")
              : t("dashboard.metricAlertsDetail")
          }
          icon={AlertTriangle}
          warning={(alertTotal ?? 0) > 0}
        />
        <Metric
          label={t("dashboard.metricCapacity")}
          value={formatCapacityM3(capacityM3)}
          detail={
            getUnitSystem() === "imperial"
              ? t("dashboard.metricCapacityDetailAlt", {
                  volume: formatNumber(capacityM3, 1),
                })
              : t("dashboard.metricCapacityDetail", {
                  barrels: formatBarrels(capacityM3 * 1000),
                })
          }
          icon={Waves}
        />
      </div>
      <section className="card overflow-hidden" aria-labelledby="fleet-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="fleet-title" className="text-sm font-semibold">
              {t("dashboard.fleetTitle")}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("dashboard.fleetHint")}
            </p>
          </div>
          <Link
            to="/tanks"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          >
            {t("dashboard.fleetLink")}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {tanks.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted-foreground">
            {t("dashboard.fleetEmpty")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 xl:grid-cols-6">
            {tanks.map((tank) => {
              const forecast = byTank.get(tank.id);
              const level = forecast?.dataFresh ? forecast.currentLevel : null;
              const height = Number(tank.dimensions.height);
              const pct =
                level != null && height > 0
                  ? Math.max(0, Math.min(100, (level / height) * 100))
                  : null;
              const high =
                level != null &&
                tank.maxLevelThreshold != null &&
                level >= Number(tank.maxLevelThreshold);
              const maintenance = tank.status === "maintenance";
              return (
                <button
                  type="button"
                  key={tank.id}
                  aria-pressed={selectedId === tank.id}
                  onClick={() => setSelectedId(tank.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${selectedId === tank.id ? "border-primary/40 bg-primary/[0.04]" : "border-transparent hover:border-border hover:bg-muted/40"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold">
                      {tank.code}
                    </span>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${maintenance ? "bg-amber-400" : level == null ? "bg-slate-400" : high ? "bg-red-500" : "bg-teal-500"}`}
                    />
                  </div>
                  <div className="relative mx-auto my-4 h-28 w-20 rounded-[10px] border-2 border-slate-300 bg-muted/30 dark:border-slate-600">
                    <div className="absolute -top-2 left-7 h-2 w-5 rounded-t border border-slate-400 bg-card" />
                    {pct != null && (
                      <div
                        className={`absolute inset-x-1 bottom-1 rounded-b-md border-t-2 ${high ? "border-red-500 bg-red-500/15" : "border-teal-500 bg-teal-500/15"}`}
                        style={{
                          height: `${Math.min(94, pct)}%`,
                          backgroundImage:
                            "repeating-linear-gradient(135deg,transparent,transparent 4px,rgba(20,184,166,0.08) 4px,rgba(20,184,166,0.08) 5px)",
                        }}
                      />
                    )}
                    {tank.maxLevelThreshold != null && height > 0 && (
                      <div
                        className="absolute inset-x-0 border-t border-dashed border-amber-500/80"
                        style={{
                          bottom: `${Math.min(100, (Number(tank.maxLevelThreshold) / height) * 100)}%`,
                        }}
                      />
                    )}
                    <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-semibold">
                      {pct == null ? "—" : `${formatNumber(pct)}%`}
                    </span>
                    <span className="absolute -bottom-2 left-2 h-1.5 w-1 bg-slate-400" />
                    <span className="absolute -bottom-2 right-2 h-1.5 w-1 bg-slate-400" />
                  </div>
                  <p className="metric-value text-center text-lg font-semibold">
                    {level == null ? "—" : formatLevel(level)}
                  </p>
                  {level != null && (
                    <p className="mt-0.5 text-center font-mono text-[10px] text-muted-foreground">
                      {formatFeet(level)}
                    </p>
                  )}
                  <p
                    className={`mt-1 text-center text-[10px] ${maintenance ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}
                  >
                    {maintenance
                      ? t("dashboard.tankMaintenance")
                      : level == null
                        ? t("dashboard.tankNoReading")
                        : high
                          ? t("dashboard.tankAboveMax")
                          : t("dashboard.tankRecent")}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
            {t("dashboard.legendRecent")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 border-t border-dashed border-amber-500" />
            {t("dashboard.legendMax")}
          </span>
          <span className="ml-auto">{t("dashboard.legendAxis")}</span>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0" aria-labelledby="chart-title">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
            <div>
              <h2 id="chart-title" className="text-sm font-semibold">
                {t("dashboard.chartTitle")}{" "}
                <span className="ml-1 font-mono text-primary">
                  {selected?.code}
                </span>
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("dashboard.chartSub")}
              </p>
            </div>
            <Link
              to="/readings"
              className="inline-flex items-center gap-1 text-xs text-primary"
            >
              {t("dashboard.chartLink")}
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div
            className="h-[250px] px-3 pb-3 pt-6"
            role="img"
            aria-label={t("dashboard.chartAria", {
              code: selected?.code || "",
              count: chart.length,
            })}
          >
            {chartState === "loading" ? (
              <div className="flex h-full items-center justify-center">
                <LoadingSpinner />
              </div>
            ) : chartState === "error" ? (
              <p className="flex h-full items-center justify-center text-sm text-destructive">
                {t("dashboard.chartError")}
              </p>
            ) : chart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Activity className="h-6 w-6 opacity-50" />
                <p className="text-xs">{t("dashboard.chartEmpty")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={withTelemetryGaps(chart, 300000)}
                  margin={{ top: 8, right: 20, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="level-fill" x1="0" x2="0" y1="0" y2="1">
                      <stop
                        offset="0%"
                        stopColor="#14b8a6"
                        stopOpacity={0.22}
                      />
                      <stop
                        offset="100%"
                        stopColor="#14b8a6"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="hsl(var(--border))"
                    vertical={false}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    scale="time"
                    tickFormatter={(value) =>
                      new Date(value).toLocaleTimeString(currentLocale(), {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    }
                    minTickGap={45}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, Number(selected?.dimensions.height) || "auto"]}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(value) => `${value}m`}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      fontSize: 11,
                    }}
                    labelFormatter={(value) =>
                      new Date(Number(value)).toLocaleString(currentLocale())
                    }
                    formatter={(value: number) => [
                      `${levelValue(value)} ${unitSuffixes().level}`,
                      t("common.avgLevel"),
                    ]}
                  />
                  {selected?.maxLevelThreshold != null && (
                    <ReferenceLine
                      y={Number(selected.maxLevelThreshold)}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="level"
                    stroke="#14b8a6"
                    fill="url(#level-fill)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-border px-5 py-4">
            <div>
              <p className="eyebrow">{t("dashboard.trendLabel")}</p>
              <p className="mt-1 text-xs font-semibold">
                {selectedForecast?.trend === "rising"
                  ? t("dashboard.trendRising")
                  : selectedForecast?.trend === "falling"
                    ? t("dashboard.trendFalling")
                    : selectedForecast?.trend === "stable"
                      ? t("dashboard.trendStable")
                      : t("dashboard.trendUnknown")}
              </p>
            </div>
            <div>
              <p className="eyebrow">{t("dashboard.pace")}</p>
              <p className="mt-1 font-mono text-xs">
                {selectedForecast?.fillRateMH != null
                  ? formatRateMH(selectedForecast.fillRateMH)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="eyebrow">{t("dashboard.lastReading")}</p>
              <p className="mt-1 text-xs">
                {selectedForecast?.lastReadingAt
                  ? formatElapsed(
                      new Date(selectedForecast.lastReadingAt).getTime(),
                    )
                  : t("common.notAvailable")}
              </p>
            </div>
          </div>
        </section>
        <section className="card flex flex-col" aria-labelledby="alerts-title">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="alerts-title" className="text-sm font-semibold">
              {t("dashboard.attentionTitle")}
            </h2>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="flex-1 divide-y divide-border">
            {alertTotal == null ? (
              <p className="p-5 text-xs text-muted-foreground">
                {t("dashboard.alertsUnavailable")}
              </p>
            ) : alerts.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="mx-auto h-7 w-7 text-primary" />
                <p className="mt-3 text-xs text-muted-foreground">
                  {t("dashboard.noPendingAlerts")}
                </p>
              </div>
            ) : (
              alerts.map((alert) => (
                <Link
                  key={alert.id}
                  to="/alerts"
                  className="block px-5 py-3 hover:bg-muted/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold">
                      {alert.tank?.code || t("dashboard.operationFallback")}
                    </p>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${alert.severity === "critical" ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
                    >
                      {t(`severity.${alert.severity}`)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-[11px] text-muted-foreground">
                    {alert.title}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/80">
                    {new Date(alert.createdAt).toLocaleString(currentLocale(), {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </Link>
              ))
            )}
          </div>
          <Link
            to="/alerts"
            className="flex items-center justify-between border-t border-border px-5 py-3 text-xs font-medium text-primary"
          >
            {t("dashboard.openAlertCenter")}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card px-5 py-4">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">
              {t("dashboard.windowTitle")}
            </h2>
          </div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            {atRisk.length
              ? atRisk
                  .map((f) =>
                    t("dashboard.windowAtRisk", {
                      tank: f.tankCode,
                      eta: formatHours(f.etaOverflowHours!),
                    }),
                  )
                  .join(" · ")
              : forecasts.some((f) => f.dataFresh)
                ? t("dashboard.windowNone")
                : t("dashboard.windowWaiting")}
          </p>
          <p className="mt-2 text-[10px] leading-5 text-muted-foreground">
            {t("dashboard.windowDisclaimer")}
          </p>
        </section>
        <section className="card px-5 py-4">
          <h2 className="text-sm font-semibold">
            {t("dashboard.servicesTitle")}
          </h2>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {(
              [
                { key: "api", labelKey: "dashboard.serviceApi", icon: Server },
                {
                  key: "database",
                  labelKey: "dashboard.serviceDatabase",
                  icon: Database,
                },
                { key: "mqtt", labelKey: "dashboard.serviceMqtt", icon: Radio },
              ] as const
            ).map((service) => {
              const status = health?.components[service.key];
              return (
                <div key={service.key} className="flex items-center gap-2">
                  <service.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-[11px] font-medium">
                      {t(service.labelKey)}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${status === "up" ? "text-primary" : status === "disabled" ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}
                    >
                      {status === "up"
                        ? t("dashboard.serviceUp")
                        : status === "down"
                          ? t("dashboard.serviceDown")
                          : status === "disabled"
                            ? t("dashboard.serviceDisabled")
                            : t("dashboard.serviceUnchecked")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span
              className={`h-1.5 w-1.5 rounded-full ${isConnected ? "bg-teal-500" : "bg-amber-500"}`}
            />
            {lastReading
              ? t("dashboard.lastEvent", {
                  sensor: lastReading.sensorId,
                  time: formatTimeOfDay(lastReading.timestamp),
                })
              : isConnected
                ? t("dashboard.channelOpen")
                : t("nav.channelDisconnected")}
          </p>
        </section>
      </div>
      <div className="flex items-center justify-between border-t border-border pt-4 text-[10px] text-muted-foreground">
        <span>{t("dashboard.footerBrand")}</span>
        <span>{t("dashboard.footerRefresh")}</span>
      </div>
    </div>
  );
}
