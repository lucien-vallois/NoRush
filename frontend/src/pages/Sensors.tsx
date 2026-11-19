import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  RefreshCw,
  AlertTriangle,
  Wifi,
  WifiOff,
  Radio,
  FilterX,
  Plus,
} from "lucide-react";
import { apiService } from "../services/api";
import { Sensor, ReadingEventPayload, Tank } from "../types";
import LoadingSpinner from "../components/common/LoadingSpinner";
import { useWebSocket } from "../contexts/WebSocketContext";
import { useWebSocketEvent } from "../hooks/useWebSocketEvent";
import { currentLocale } from "../i18n";
import { formatElapsed, formatTimeOfDay } from "../utils/format";
import { formatLevel } from "../utils/units.ts";
import SensorKpiCards from "../components/sensors/SensorKpiCards";
import SensorsTable, { SensorRowView } from "../components/sensors/SensorsTable";
import GaugeFormDialog from "../components/sensors/GaugeFormDialog";
import { useAuth } from "../contexts/AuthContext";
import { useDemoReadOnly } from "../hooks/useDemoReadOnly";

/** Janela para considerar o sensor online (última transmissão) */
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
/** Limite de bateria baixa/crítica (%) */
const LOW_BATTERY_PCT = 20;

type StatusFilter = "all" | "online" | "offline" | "lowBattery";

const STATUS_FILTER_KEYS: Record<StatusFilter, string> = {
  all: "sensors.statusAll",
  online: "sensors.statusOnline",
  offline: "sensors.statusOffline",
  lowBattery: "sensors.statusLowBattery",
};

const Sensors: React.FC = () => {
  const { t } = useTranslation();
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [tankFilter, setTankFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Ticker de 1s: recomputa "há X", status online e o decaimento do pisca
  const [now, setNow] = useState(() => Date.now());

  // Ao vivo: sensorId (business id) → ms do último evento 'reading'
  const [flash, setFlash] = useState<Record<string, number>>({});
  const [lastLive, setLastLive] = useState<ReadingEventPayload | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const { isConnected } = useWebSocket();

  // Cadastro/edição de hastes: admin cadastra e gerencia credenciais;
  // manutenção edita o cadastro
  const { user, hasRole } = useAuth();
  const demoReadOnly = useDemoReadOnly();
  const isAdmin = user?.role === "admin" && !demoReadOnly;
  const canEdit = !demoReadOnly && hasRole("maintenance");
  const [allTanks, setAllTanks] = useState<Tank[]>([]);
  const [authMode, setAuthMode] = useState<"shared" | "device" | "hybrid" | null>(null);
  const [gaugeForm, setGaugeForm] = useState<{ open: boolean; sensor: Sensor | null }>({
    open: false,
    sensor: null,
  });
  const openGaugeForm = (sensor: Sensor | null) => {
    setGaugeForm({ open: true, sensor });
    apiService
      .getTanks()
      .then((list) => setAllTanks(Array.isArray(list) ? list : []))
      .catch(() => setAllTanks([]));
    if (isAdmin) {
      apiService
        .getDevicesAuthMode()
        .then(setAuthMode)
        .catch(() => setAuthMode(null));
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadSensors = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(false);
      const data = await apiService.getSensors();
      setSensors(Array.isArray(data) ? data : []);
      setLoadedAt(Date.now());
    } catch (err: any) {
      setError(true);
      console.error("Sensors error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSensors();
  }, [loadSensors]);

  // ---- Feed ao vivo: evento 'reading' do gateway ----
  useWebSocketEvent<ReadingEventPayload>("reading", (payload) => {
    if (!payload?.sensorId) return;
    const ts =
      payload.timestamp && !isNaN(new Date(payload.timestamp).getTime())
        ? payload.timestamp
        : new Date().toISOString();

    // Obs.: a API devolve lastTransmissionAt como ISO string; o tipo declara
    // Date, então normalizamos para Date aqui (new Date aceita ambos).
    setSensors((prev) =>
      prev.map((s): Sensor =>
        s.sensorId === payload.sensorId
          ? {
              ...s,
              lastTransmissionAt: new Date(ts),
              transmissionCount: (Number(s.transmissionCount) || 0) + 1,
            }
          : s,
      ),
    );
    setFlash((prev) => ({ ...prev, [payload.sensorId]: Date.now() }));
    setLastLive(payload);
    setLiveCount((c) => c + 1);
  });

  // ---- Derivação defensiva (a API pode mandar números como string) ----
  const rows: SensorRowView[] = useMemo(() => {
    return sensors
      .map((s) => {
        const rawBatt = Number(s.batteryLevel);
        const batteryPct =
          s.batteryLevel === null ||
          s.batteryLevel === undefined ||
          !isFinite(rawBatt)
            ? null
            : Math.min(100, Math.max(0, rawBatt));
        const lastTxIso = s.lastTransmissionAt ?? null;
        const lastTxMs = lastTxIso ? new Date(lastTxIso).getTime() : null;
        const validTx = lastTxMs !== null && !isNaN(lastTxMs);
        return {
          ...s,
          batteryPct,
          lastTxIso: validTx ? lastTxIso : null,
          lastTxMs: validTx ? lastTxMs : null,
          online: validTx ? now - (lastTxMs as number) < ONLINE_WINDOW_MS : false,
        } as SensorRowView;
      })
      .sort((a, b) =>
        (a.sensorId ?? "").localeCompare(b.sensorId ?? "", currentLocale(), {
          numeric: true,
        }),
      );
  }, [sensors, now]);

  const kpis = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((s) => s.status === "active").length,
      online: rows.filter((s) => s.online).length,
      lowBattery: rows.filter(
        (s) => s.batteryPct !== null && s.batteryPct < LOW_BATTERY_PCT,
      ).length,
      maintenance: rows.filter((s) => s.status === "maintenance").length,
    }),
    [rows],
  );

  // Tanques únicos para o filtro (ordenados por código)
  const tankOptions: Tank[] = useMemo(() => {
    const map = new Map<string, Tank>();
    rows.forEach((s) => {
      if (s.tank && !map.has(s.tank.id)) map.set(s.tank.id, s.tank);
    });
    return [...map.values()].sort((a, b) =>
      (a.code ?? "").localeCompare(b.code ?? "", currentLocale(), {
        numeric: true,
      }),
    );
  }, [rows]);

  // ---- Filtro client-side ----
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((s) => {
      if (
        q &&
        !(s.sensorId ?? "").toLowerCase().includes(q) &&
        !(s.name ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      if (tankFilter !== "all" && s.tankId !== tankFilter) return false;
      if (statusFilter === "online") return s.online;
      if (statusFilter === "offline") return !s.online;
      if (statusFilter === "lowBattery")
        return s.batteryPct !== null && s.batteryPct < LOW_BATTERY_PCT;
      return true;
    });
  }, [rows, search, tankFilter, statusFilter]);

  const hasActiveFilters =
    search.trim() !== "" || tankFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setTankFilter("all");
    setStatusFilter("all");
  };

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error && loadedAt === null) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {t("sensors.errorTitle")}
        </h3>
        <p className="text-muted-foreground mb-4">{t("sensors.errorMsg")}</p>
        <button onClick={() => loadSensors()} className="btn btn-primary">
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("sensors.heading")}
          </h1>
          <p className="text-muted-foreground mt-2">{t("sensors.sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => openGaugeForm(null)} className="btn btn-primary px-4 h-10">
              <Plus className="h-4 w-4 mr-2" />
              {t("gaugeForm.newButton")}
            </button>
          )}
          <button
            onClick={() => loadSensors(true)}
            disabled={refreshing}
            className="btn btn-secondary px-4 h-10"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? t("common.updating") : t("common.refresh")}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"
        >
          {t("sensors.errorMsg")} {t("common.staleData")}
        </p>
      )}

      {/* Faixa AO VIVO */}
      <div className="card px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="relative flex h-3 w-3">
              {isConnected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${
                  isConnected ? "bg-green-500" : "bg-gray-400"
                }`}
              />
            </span>
            <span className="text-sm font-bold tracking-wide text-foreground uppercase">
              {t("common.live")}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                isConnected
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {isConnected ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              {isConnected
                ? t("common.wsConnected")
                : t("common.wsOffline")}
            </span>
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Radio className="h-4 w-4 text-muted-foreground shrink-0" />
            {lastLive ? (
              <span className="text-sm text-foreground truncate">
                <span className="font-semibold">{lastLive.sensorId}</span>
                <span className="text-muted-foreground"> • </span>
                {typeof lastLive.level === "number"
                  ? formatLevel(lastLive.level)
                  : "—"}
                <span className="text-muted-foreground"> • </span>
                {formatTimeOfDay(lastLive.timestamp ?? Date.now())}{" "}
                <span className="text-muted-foreground">
                  (
                  {formatElapsed(
                    new Date(lastLive.timestamp ?? Date.now()).getTime(),
                    now,
                  )}
                  )
                </span>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t("common.awaitingLive")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-4 ml-auto shrink-0 text-xs text-muted-foreground">
            <span className="tabular-nums">
              <span className="font-semibold text-foreground">{liveCount}</span>{" "}
              {t("sensors.liveReadings", { count: liveCount })}
            </span>
            {loadedAt !== null && (
              <span className="tabular-nums">
                {t("common.updated", { time: formatTimeOfDay(loadedAt) })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <SensorKpiCards kpis={kpis} />

      {/* Filtros */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("sensors.searchPlaceholder")}
              className="input pl-9"
              aria-label={t("sensors.searchAria")}
            />
          </div>
          <select
            value={tankFilter}
            onChange={(e) => setTankFilter(e.target.value)}
            className="input"
            aria-label={t("sensors.filterTankAria")}
          >
            <option value="all">{t("sensors.allTanks")}</option>
            {tankOptions.map((tank) => (
              <option key={tank.id} value={tank.id}>
                {tank.code} — {tank.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="input"
            aria-label={t("sensors.filterStatusAria")}
          >
            {(Object.keys(STATUS_FILTER_KEYS) as StatusFilter[]).map((key) => (
              <option key={key} value={key}>
                {t(STATUS_FILTER_KEYS[key])}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
          <span>
            {t("sensors.showing", {
              shown: filteredRows.length,
              total: rows.length,
            })}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <FilterX className="h-3.5 w-3.5" />
              {t("common.clearFilters")}
            </button>
          )}
        </div>
      </div>

      {/* Tabela */}
      {filteredRows.length > 0 ? (
        <SensorsTable
          rows={filteredRows}
          now={now}
          flash={flash}
          onEdit={canEdit ? (s) => openGaugeForm(s) : undefined}
        />
      ) : (
        <div className="card">
          <div className="text-center py-12">
            <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {t("sensors.emptyTitle")}
            </h3>
            <p className="text-muted-foreground mb-4">
              {t("sensors.emptyDesc")}
            </p>
            <button onClick={clearFilters} className="btn btn-primary">
              {t("common.clearFilters")}
            </button>
          </div>
        </div>
      )}

      <GaugeFormDialog
        open={gaugeForm.open && !demoReadOnly}
        sensor={gaugeForm.sensor}
        tanks={allTanks}
        canManageCredentials={isAdmin}
        authMode={authMode}
        onClose={() => setGaugeForm({ open: false, sensor: null })}
        onSaved={() => loadSensors(true)}
      />
    </div>
  );
};

export default Sensors;
