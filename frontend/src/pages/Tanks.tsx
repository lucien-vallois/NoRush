import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { apiService } from "../services/api";
import { Tank, TankForecast } from "../types";
import { formatTimeOfDay } from "../utils/format";
import LoadingSpinner from "../components/common/LoadingSpinner";
import TankCard, {
  buildTankView,
  sortTankViews,
  TankView,
} from "../components/tanks/TankCard";
import TankMap, { MapFocus } from "../components/tanks/TankMap";
import TankDetailDrawer from "../components/tanks/TankDetailDrawer";
import TankFormDialog from "../components/tanks/TankFormDialog";
import { useAuth } from "../contexts/AuthContext";

const REFRESH_INTERVAL_MS = 60_000;

const Tanks: React.FC = () => {
  const { t } = useTranslation();
  const [views, setViews] = useState<TankView[] | null>(null); // null = carregando
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);
  const focusNonce = useRef(0);
  const { hasRole } = useAuth();
  const canEdit = hasRole("maintenance"); // admin ou manutenção
  const [form, setForm] = useState<{ open: boolean; tank: Tank | null }>({
    open: false,
    tank: null,
  });
  const openNew = () => setForm({ open: true, tank: null });

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const tanks = await apiService.getTanks();
      const [latestReadings, forecasts] = await Promise.all([
        Promise.all(
          (tanks ?? []).map((tank: Tank) =>
            apiService.getLatestReadingsByTank(tank.id, 1).catch(() => []),
          ),
        ),
        // Previsões são complementares: falha aqui não derruba a página
        apiService.getPredictions().catch(() => [] as TankForecast[]),
      ]);
      const byTank = new Map((forecasts ?? []).map((f) => [f.tankId, f]));
      setViews(
        (tanks ?? []).map((tank: Tank, index) =>
          buildTankView(
            tank,
            latestReadings[index]?.[0]?.level,
            byTank.get(tank.id),
          ),
        ),
      );
      setUpdatedAt(new Date().toISOString());
      setError(false);
    } catch (err) {
      console.error("Tanks error:", err);
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  /** Seleciona um tanque: abre o painel e foca o mapa */
  const handleSelect = useCallback(
    (id: string, centerMap = true) => {
      setSelectedId(id);
      const tank = views?.find((v) => v.tank.id === id)?.tank;
      if (centerMap && tank) {
        const lat = Number(tank.latitude);
        const lng = Number(tank.longitude);
        if (isFinite(lat) && isFinite(lng)) {
          focusNonce.current += 1;
          setFocus({ lat, lng, nonce: focusNonce.current });
        }
      }
    },
    [views],
  );

  const selected = useMemo(
    () => views?.find((v) => v.tank.id === selectedId) ?? null,
    [views, selectedId],
  );

  const sorted = useMemo(
    () => (views ?? []).slice().sort(sortTankViews),
    [views],
  );

  const summary = useMemo(() => {
    const list = views ?? [];
    return {
      total: list.length,
      active: list.filter((v) => v.tank.status === "active").length,
      maintenance: list.filter((v) => v.tank.status === "maintenance").length,
      atRisk: list.filter((v) => v.critical).length,
    };
  }, [views]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {t("tanks.heading")}
          </h1>
          <p className="mt-1 text-muted-foreground">{t("tanks.sub")}</p>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <button onClick={openNew} className="btn btn-primary h-9 px-3">
              <Plus className="h-4 w-4" />
              <span className="ml-2">{t("tankForm.newButton")}</span>
            </button>
          )}
          {updatedAt && !error && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("common.updated", { time: formatTimeOfDay(updatedAt) })}
            </span>
          )}
          <button
            onClick={load}
            className="btn btn-secondary h-9 px-3"
            disabled={refreshing}
            aria-label={t("tanks.refreshAria")}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            <span className="ml-2 hidden sm:inline">{t("common.refresh")}</span>
          </button>
        </div>
      </div>

      {error && views != null && views.length > 0 && (
        <p
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {t("tanks.error")} {t("common.staleData")}
        </p>
      )}
      {error && (views == null || views.length === 0) ? (
        /* Erro geral */
        <div className="card">
          <div className="card-content flex flex-col items-center py-14 text-center">
            <AlertTriangle className="mb-3 h-10 w-10 text-red-500" />
            <p className="mb-1 font-semibold text-foreground">
              {t("tanks.loadFailed")}
            </p>
            <p className="mb-4 max-w-md text-sm text-muted-foreground">
              {t("tanks.error")}
            </p>
            <button onClick={load} className="btn btn-primary">
              {t("common.tryAgain")}
            </button>
          </div>
        </div>
      ) : views == null ? (
        /* Loading */
        <div className="card">
          <div className="card-content flex items-center justify-center py-16">
            <LoadingSpinner />
            <span className="ml-3 text-sm text-muted-foreground">
              {t("tanks.loading")}
            </span>
          </div>
        </div>
      ) : views.length === 0 ? (
        /* Vazio */
        <div className="card">
          <div className="card-content flex flex-col items-center gap-4 py-14 text-center text-sm text-muted-foreground">
            <p>{t("tanks.empty")}</p>
            {canEdit && (
              <button onClick={openNew} className="btn btn-primary">
                <Plus className="mr-2 h-4 w-4" />
                {t("tankForm.firstTank")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Mapa + resumo */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="card overflow-hidden xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("tanks.mapTitle")}
                </h3>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500" />{" "}
                    {t("tanks.legendActive")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />{" "}
                    {t("tanks.legendMaintenance")}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />{" "}
                    {t("tanks.legendRisk")}
                  </span>
                </div>
              </div>
              <div className="h-[420px]">
                <TankMap
                  views={views}
                  focus={focus}
                  onSelectTank={handleSelect}
                />
              </div>
            </div>

            {/* Resumo */}
            <div className="card">
              <div className="card-header pb-3">
                <h3 className="card-title text-lg">{t("tanks.summaryTitle")}</h3>
                <p className="card-description">{t("tanks.summaryDesc")}</p>
              </div>
              <div className="card-content grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-bold text-foreground tabular-nums">
                    {summary.total}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("tanks.summaryTotal")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
                    {summary.active}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("tanks.summaryActive")}
                  </p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-2xl font-bold text-amber-500 tabular-nums">
                    {summary.maintenance}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("tanks.summaryMaintenance")}
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-3 ${
                    summary.atRisk > 0
                      ? "border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950"
                      : "border-border"
                  }`}
                >
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      summary.atRisk > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground"
                    }`}
                  >
                    {summary.atRisk}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("tanks.summaryAtRisk")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cards dos tanques (ordenados por criticidade) */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sorted.map((v) => (
              <TankCard
                key={v.tank.id}
                view={v}
                selected={v.tank.id === selectedId}
                onSelect={(id) => handleSelect(id)}
              />
            ))}
          </div>
        </>
      )}

      {/* Painel de detalhe */}
      <TankDetailDrawer
        view={selected}
        onClose={() => setSelectedId(null)}
        onEdit={
          canEdit
            ? (tank) => {
                setSelectedId(null);
                setForm({ open: true, tank });
              }
            : undefined
        }
      />

      {/* Cadastro / edição */}
      <TankFormDialog
        open={form.open}
        tank={form.tank}
        onClose={() => setForm({ open: false, tank: null })}
        onSaved={(saved) => {
          setForm({ open: false, tank: null });
          load().then(() => setSelectedId(saved.id));
        }}
      />
    </div>
  );
};

export default Tanks;
