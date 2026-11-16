import React from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { ForecastTrend } from "../../types";
import { formatHours } from "../../utils/format";
import {
  formatLevel,
  formatVolumeL,
  formatDimension,
  formatRateMH,
} from "../../utils/units.ts";
import { toFinite } from "../../utils/tankView.ts";
import type { TankView } from "../../utils/tankView.ts";
import LevelBar from "./LevelBar";

export { buildTankView, OVERFLOW_CRITICAL_H } from "../../utils/tankView.ts";
export type { MarkerColor, TankView } from "../../utils/tankView.ts";

/** Ordena por criticidade: risco de transbordo primeiro (menor ETA), depois por código */
export function sortTankViews(a: TankView, b: TankView): number {
  if (a.critical !== b.critical) return a.critical ? -1 : 1;
  const ea = a.etaOverflowHours ?? Number.POSITIVE_INFINITY;
  const eb = b.etaOverflowHours ?? Number.POSITIVE_INFINITY;
  if (ea !== eb) return ea - eb;
  return a.tank.code.localeCompare(b.tank.code);
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
  maintenance:
    "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  inactive: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  error: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation();
  const cls = STATUS_STYLES[status] ?? STATUS_STYLES.inactive;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {t(`tankStatus.${status}`)}
    </span>
  );
};

const TREND_STYLES: Record<
  ForecastTrend,
  { icon: React.ElementType; className: string }
> = {
  rising: { icon: TrendingUp, className: "text-blue-500" },
  falling: { icon: TrendingDown, className: "text-amber-500" },
  stable: { icon: Minus, className: "text-muted-foreground" },
  unknown: { icon: HelpCircle, className: "text-muted-foreground" },
};

export const TrendBadge: React.FC<{ trend?: ForecastTrend }> = ({ trend }) => {
  const { t } = useTranslation();
  const style = TREND_STYLES[trend ?? "unknown"] ?? TREND_STYLES.unknown;
  const Icon = style.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${style.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {t(`trend.${trend ?? "unknown"}`)}
    </span>
  );
};

/**
 * Formatadores de exibição no sistema de unidades ativo (ft/bbl ou m/L).
 * Mantidos exportados porque TankMap/TankDetailDrawer os reutilizam.
 */
export function formatVolume(volume?: number | null): string {
  return formatVolumeL(volume);
}

export function formatMeters(v: number | null | undefined, digits = 2): string {
  return formatLevel(v, digits);
}

interface TankCardProps {
  view: TankView;
  selected?: boolean;
  onSelect: (id: string) => void;
}

const TankCard: React.FC<TankCardProps> = ({ view, selected, onSelect }) => {
  const { t } = useTranslation();
  const { tank, forecast, level, etaOverflowHours, critical } = view;
  const height = toFinite(tank?.dimensions?.height);
  const pctOfHeight =
    level != null && height ? Math.round((level / height) * 100) : null;

  const etaFallback =
    forecast?.trend === "falling" ? toFinite(forecast.etaMinLevelHours) : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(tank.id)}
      className={`card w-full p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-1 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        selected ? "ring-2 ring-primary" : ""
      }`}
      aria-label={t("tankCard.viewDetailsAria", { code: tank.code })}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-foreground">{tank.code}</h3>
            <StatusBadge status={tank.status} />
          </div>
          <p className="truncate text-xs text-muted-foreground">{tank.name}</p>
        </div>
        {view.forecastAvailable ? (
          <TrendBadge trend={forecast?.trend} />
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
            <HelpCircle className="h-3.5 w-3.5" />
            {t("tankCard.forecastUnavailable")}
          </span>
        )}
      </div>

      {/* Nível atual */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("tankCard.currentLevel")}
          </span>
          <span
            className={`text-sm font-bold tabular-nums ${
              critical ? "text-red-600 dark:text-red-400" : "text-foreground"
            }`}
          >
            {formatMeters(level)}
          </span>
        </div>
        <LevelBar
          level={level}
          height={height ?? undefined}
          thresholds={{
            min: tank.minLevelThreshold,
            low: tank.lowLevelThreshold,
            max: tank.maxLevelThreshold,
            overflow: tank.overflowThreshold,
          }}
        />
        <p className="text-[11px] text-muted-foreground tabular-nums">
          {pctOfHeight != null
            ? t("tankCard.pctOfHeight", {
                pct: pctOfHeight,
                height: formatMeters(height, 1),
              })
            : t("tankCard.noRecentReading")}
        </p>
      </div>

      {/* Ritmo e ETA */}
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t("tankCard.pace")}
          </p>
          <p className="text-sm font-semibold text-foreground tabular-nums">
            {forecast?.fillRateMH != null
              ? formatRateMH(toFinite(forecast.fillRateMH))
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {etaOverflowHours != null
              ? t("tankCard.etaOverflow")
              : t("tankCard.etaMinLevel")}
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${
              critical
                ? "text-red-600 dark:text-red-400"
                : etaFallback != null
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-foreground"
            }`}
          >
            {etaOverflowHours != null
              ? `~${formatHours(etaOverflowHours)}`
              : etaFallback != null
                ? `~${formatHours(etaFallback)}`
                : "—"}
          </p>
        </div>
      </div>

      {/* Dimensões */}
      <p className="mt-3 text-xs text-muted-foreground tabular-nums">
        {formatDimension(tank?.dimensions?.height)} × Ø{" "}
        {formatDimension(tank?.dimensions?.diameter)}
        {" · Vol. "}
        {formatVolume(tank?.dimensions?.volume)}
      </p>

      {/* Thresholds */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] tabular-nums">
        {[
          {
            label: t("tankCard.thresholdMax"),
            v: tank.maxLevelThreshold,
            cls: "text-orange-700 bg-orange-100 dark:bg-orange-950 dark:text-orange-400",
          },
          {
            label: t("tankCard.thresholdOverflow"),
            v: tank.overflowThreshold,
            cls: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-400",
          },
          {
            label: t("tankCard.thresholdMin"),
            v: tank.minLevelThreshold,
            cls: "text-sky-700 bg-sky-100 dark:bg-sky-950 dark:text-sky-400",
          },
          {
            label: t("tankCard.thresholdLow"),
            v: tank.lowLevelThreshold,
            cls: "text-sky-700 bg-sky-100 dark:bg-sky-950 dark:text-sky-400",
          },
        ]
          .filter((item) => item.v != null)
          .map((item) => (
            <span
              key={item.label}
              className={`rounded px-1.5 py-0.5 font-medium ${item.cls}`}
            >
              {item.label}{" "}
              {formatLevel(item.v, 1)}
            </span>
          ))}
      </div>
    </button>
  );
};

export default TankCard;
