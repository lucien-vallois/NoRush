import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertOctagon,
  ArrowDownToLine,
  HelpCircle,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { apiService } from "../../services/api";
import { currentLocale } from "../../i18n";
import { ForecastEventPayload, ForecastTrend, TankForecast } from "../../types";
import { useWebSocketEvent } from "../../hooks/useWebSocketEvent";
import { formatHours, formatTimeOfDay, formatSigned } from "../../utils/format";
import { formatLevel, formatRateMH, formatRateM3H } from "../../utils/units.ts";
import LoadingSpinner from "../common/LoadingSpinner";

/** Limite de ETA de transbordo considerado crítico (destaque vermelho) */
const OVERFLOW_CRITICAL_H = 6;
const REFRESH_INTERVAL_MS = 30_000;

interface TrendStyle {
  icon: React.ElementType;
  className: string;
}

const TREND_STYLES: Record<ForecastTrend, TrendStyle> = {
  rising: { icon: TrendingUp, className: "text-blue-500" },
  falling: { icon: TrendingDown, className: "text-amber-500" },
  stable: { icon: Minus, className: "text-muted-foreground" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground" },
};

/** ETA mais relevante do tanque (menor limite a ser atingido) */
function primaryEta(f: TankForecast): number {
  return Math.min(
    ...[f.etaOverflowHours, f.etaMaxLevelHours, f.etaMinLevelHours]
      .filter((v): v is number => v != null && isFinite(v))
      .concat(Number.POSITIVE_INFINITY),
  );
}

function sortByCriticality(a: TankForecast, b: TankForecast): number {
  const ea = primaryEta(a);
  const eb = primaryEta(b);
  if (ea !== eb) return ea - eb;
  return a.tankCode.localeCompare(b.tankCode);
}

/** Linha de ETA em destaque do card */
const EtaHighlight: React.FC<{ forecast: TankForecast }> = ({
  forecast: f,
}) => {
  const { t } = useTranslation();
  if (!f.dataFresh)
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        {t("predictions.stale")}
      </p>
    );
  if (f.etaOverflowHours != null) {
    const critical = f.etaOverflowHours <= OVERFLOW_CRITICAL_H;
    return (
      <p
        className={`text-sm font-bold ${
          critical ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        <AlertOctagon
          className={`inline h-4 w-4 mr-1 -mt-0.5 ${
            critical
              ? "text-red-600 dark:text-red-400"
              : "text-muted-foreground"
          }`}
        />
        {t("predictions.etaOverflowIn", {
          eta: formatHours(f.etaOverflowHours),
        })}
      </p>
    );
  }
  if (f.trend === "falling" && f.etaMinLevelHours != null) {
    return (
      <p className="text-sm font-bold text-amber-600 dark:text-amber-400">
        <ArrowDownToLine className="inline h-4 w-4 mr-1 -mt-0.5" />
        {t("predictions.minLevelIn", {
          eta: formatHours(f.etaMinLevelHours),
        })}
      </p>
    );
  }
  return (
    <p className="text-sm font-semibold text-muted-foreground">
      <HelpCircle className="inline h-4 w-4 mr-1 -mt-0.5" />
      {t("predictions.noForecast")}
    </p>
  );
};

const ForecastCard: React.FC<{ forecast: TankForecast }> = ({
  forecast: f,
}) => {
  const { t } = useTranslation();
  const trend = TREND_STYLES[f.trend] ?? TREND_STYLES.unknown;
  const TrendIcon = trend.icon;
  const confidencePct = Math.round((f.confidence ?? 0) * 100);

  return (
    <div className="card p-4 flex flex-col gap-3">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="font-semibold text-foreground">{f.tankCode}</h4>
          <p className="text-xs text-muted-foreground truncate">{f.tankName}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${trend.className}`}
        >
          <TrendIcon className="h-4 w-4" />
          {t(`trend.${f.trend}`)}
        </span>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("predictions.level")}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {f.currentLevel != null ? formatLevel(f.currentLevel) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("predictions.pace")}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {f.fillRateMH != null ? formatRateMH(f.fillRateMH) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("predictions.flow")}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {f.fillRateM3H != null ? formatRateM3H(f.fillRateM3H) : "—"}
          </p>
        </div>
      </div>

      {/* Confiança (R²) */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">
            {t("predictions.linearFit")}
          </span>
          <span className="font-semibold text-foreground tabular-nums">
            {confidencePct}%
          </span>
        </div>
        <div className="w-full bg-muted rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${
              confidencePct >= 60 ? "bg-green-500" : "bg-yellow-500"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, confidencePct))}%` }}
          />
        </div>
      </div>

      {/* ETA em destaque */}
      <div className="pt-2 border-t border-border">
        <EtaHighlight forecast={f} />
        {f.etaOverflowHours == null && f.etaMaxLevelHours != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("predictions.etaMaxIn", {
              eta: formatHours(f.etaMaxLevelHours),
            })}
          </p>
        )}
      </div>
    </div>
  );
};

const PredictionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const [forecasts, setForecasts] = useState<TankForecast[]>([]);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      setRefreshing(true);
      const data = await apiService.getPredictions();
      if (!mountedRef.current) return;
      setForecasts(data);
      setUpdatedAt(new Date().toISOString());
      setError(false);
    } catch (err) {
      console.error("Predictions error:", err);
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  // Carga inicial + refresh a cada 30s
  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Refresh imediato a cada evento 'forecast' do WebSocket
  useWebSocketEvent<ForecastEventPayload>("forecast", (payload) => {
    if (payload?.forecasts?.length) {
      setForecasts(payload.forecasts);
      setUpdatedAt(payload.predictedAt || new Date().toISOString());
      setError(false);
    } else {
      load();
    }
  });

  const sorted = [...forecasts].sort(sortByCriticality);

  return (
    <div className="card">
      <div className="card-header flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <h3 className="card-title text-lg">{t("predictions.title")}</h3>
          <p className="card-description">{t("predictions.desc")}</p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {t("common.updated", { time: formatTimeOfDay(updatedAt) })}
            </span>
          )}
          <button
            onClick={load}
            className="btn btn-secondary h-8 px-3"
            disabled={refreshing}
            aria-label={t("predictions.refreshAria")}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>
      <div className="card-content">
        {error && forecasts.length === 0 ? (
          <div className="text-center py-8">
            <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              {t("predictions.errLoad")}
            </p>
            <button onClick={load} className="btn btn-primary">
              {t("common.tryAgain")}
            </button>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <LoadingSpinner size="small" />
            <span className="ml-3">{t("predictions.calculating")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((f) => (
              <ForecastCard key={f.tankId} forecast={f} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PredictionsPanel;
