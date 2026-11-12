import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, MapPin, Pencil, RefreshCw, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiService } from "../../services/api";
import { currentLocale } from "../../i18n";
import { formatHours, formatTimeOfDay } from "../../utils/format";
import {
  FT_PER_M,
  formatRateMH,
  formatRateM3H,
  formatDimension,
  getUnitSystem,
  levelValue,
  unitSuffixes,
} from "../../utils/units.ts";
import LoadingSpinner from "../common/LoadingSpinner";
import LevelBar from "./LevelBar";
import {
  StatusBadge,
  TankView,
  TrendBadge,
  formatMeters,
  formatVolume,
} from "./TankCard";

interface TankDetailDrawerProps {
  view: TankView | null;
  onClose: () => void;
  /** Presente quando o usuário pode editar o cadastro do tanque */
  onEdit?: (tank: TankView["tank"]) => void;
}

/** Ponto agregado por hora para o gráfico */
interface ChartPoint {
  bucket: string;
  level: number;
}

/**
 * Agrega a série (que vem por sensor) em uma média por bucket,
 * ponderada por sample_count.
 */
function aggregateSeries(series: any[]): ChartPoint[] {
  const acc = new Map<string, { sum: number; weight: number }>();
  for (const p of series ?? []) {
    const level = Number(p?.avg_level);
    if (!isFinite(level)) continue;
    const weight = Number(p?.sample_count) || 1;
    const cur = acc.get(p.bucket) ?? { sum: 0, weight: 0 };
    cur.sum += level * weight;
    cur.weight += weight;
    acc.set(p.bucket, cur);
  }
  return [...acc.entries()]
    .map(([bucket, { sum, weight }]) => ({
      bucket,
      level: weight > 0 ? sum / weight : null,
    }))
    .filter((p): p is ChartPoint => p.level != null)
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section>
    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h4>
    {children}
  </section>
);

const Metric: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="rounded-lg border border-border bg-background p-2.5 text-center">
    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
    <p className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
      {children}
    </p>
  </div>
);

const TankDetailDrawer: React.FC<TankDetailDrawerProps> = ({
  view,
  onClose,
  onEdit,
}) => {
  const { t } = useTranslation();
  const [points, setPoints] = useState<ChartPoint[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);

  const tankId = view?.tank.id;
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (tankId && dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, [tankId]);

  // Carrega série de nível das últimas 24h (bucket 1h) quando o tanque muda
  useEffect(() => {
    if (!tankId) return;
    let cancelled = false;

    const load = async () => {
      setChartLoading(true);
      setChartError(false);
      try {
        const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const to = new Date().toISOString();
        const res = await apiService.getTimeseries({
          tankId,
          bucket: "1h",
          from,
          to,
        });
        if (cancelled) return;
        setPoints(aggregateSeries(res?.series));
      } catch (err) {
        console.error("Timeseries error:", err);
        if (!cancelled) setChartError(true);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [tankId, reloadNonce]);

  if (!view) return null;

  const { tank, forecast, level, etaOverflowHours, critical } = view;
  const height = Number(tank?.dimensions?.height);
  const hasHeight = isFinite(height) && height > 0;
  const overflow = Number(tank?.overflowThreshold);
  const maxLevel = Number(tank?.maxLevelThreshold);

  // Escala Y do gráfico: altura do tanque (ou o maior valor visível)
  const maxLevelPoint = points.reduce((m, p) => Math.max(m, p.level), 0);
  const yMax = Math.max(
    hasHeight ? height : 0,
    isFinite(overflow) ? overflow : 0,
    isFinite(maxLevel) ? maxLevel : 0,
    maxLevelPoint * 1.1,
  );

  const etaMin =
    forecast?.trend === "falling" && forecast?.etaMinLevelHours != null
      ? Number(forecast.etaMinLevelHours)
      : null;
  const confidencePct = Math.round((Number(forecast?.confidence) || 0) * 100);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="tank-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="fixed inset-0 m-0 h-screen max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-foreground backdrop:bg-black/40"
    >
      <div className="flex h-full justify-end">
        {/* Overlay */}
        <div
          className="absolute inset-0"
          onClick={onClose}
          aria-hidden="true"
        />

        {/* Painel lateral */}
        <aside className="toast-enter relative h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-2xl">
          {/* Cabeçalho */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="tank-detail-title"
                  className="text-lg font-bold text-foreground"
                >
                  {tank.code}
                </h3>
                <StatusBadge status={tank.status} />
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {tank.name}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(tank)}
                  className="btn btn-secondary h-8 px-2.5 text-xs"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  {t("tankForm.editButton")}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("tankDetail.closeAria")}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="space-y-6 px-5 py-5">
            {/* Nível atual */}
            <Section title={t("tankDetail.sectionCurrent")}>
              <div className="rounded-lg border border-border p-3">
                <div className="flex items-baseline justify-between">
                  <span
                    className={`text-2xl font-bold tabular-nums ${
                      critical
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground"
                    }`}
                  >
                    {formatMeters(level)}
                  </span>
                  <TrendBadge trend={forecast?.trend} />
                </div>
                <div className="mt-2">
                  <LevelBar
                    level={level}
                    height={hasHeight ? height : undefined}
                    thresholds={{
                      min: tank.minLevelThreshold,
                      low: tank.lowLevelThreshold,
                      max: tank.maxLevelThreshold,
                      overflow: tank.overflowThreshold,
                    }}
                  />
                </div>
                {etaOverflowHours != null && (
                  <p
                    className={`mt-2 text-sm font-bold ${
                      critical
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground"
                    }`}
                  >
                    {critical
                      ? t("tankDetail.riskOverflow")
                      : t("tankDetail.etaOverflow")}{" "}
                    {t("tankDetail.etaIn", { eta: formatHours(etaOverflowHours) })}
                  </p>
                )}
                {etaOverflowHours == null && etaMin != null && (
                  <p className="mt-2 text-sm font-bold text-amber-600 dark:text-amber-400">
                    {t("tankDetail.minLevelIn", { eta: formatHours(etaMin) })}
                  </p>
                )}
                {etaOverflowHours == null && etaMin == null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("tankDetail.noForecast")}
                  </p>
                )}
              </div>
            </Section>

            {/* Métricas da previsão */}
            <Section title={t("tankDetail.sectionForecast")}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label={t("tankDetail.pace")}>
                  {forecast?.fillRateMH != null
                    ? formatRateMH(Number(forecast.fillRateMH))
                    : "—"}
                </Metric>
                <Metric label={t("tankDetail.flow")}>
                  {forecast?.fillRateM3H != null
                    ? formatRateM3H(Number(forecast.fillRateM3H))
                    : "—"}
                </Metric>
                <Metric label={t("tankDetail.linearFit")}>{confidencePct}%</Metric>
                <Metric label={t("tankDetail.etaMax")}>
                  {forecast?.etaMaxLevelHours != null
                    ? `~${formatHours(Number(forecast.etaMaxLevelHours))}`
                    : "—"}
                </Metric>
              </div>
              {forecast?.predictedAt && (
                <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
                  {t("tankDetail.predictedAt", {
                    time: formatTimeOfDay(forecast.predictedAt),
                  })}
                </p>
              )}
            </Section>

            {/* Gráfico 24h */}
            <Section title={t("tankDetail.section24h")}>
              <div className="rounded-lg border border-border p-2">
                {chartLoading ? (
                  <div className="flex h-[220px] items-center justify-center">
                    <LoadingSpinner size="small" />
                  </div>
                ) : chartError ? (
                  <div className="flex h-[220px] flex-col items-center justify-center gap-2 text-center">
                    <HelpCircle className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {t("tankDetail.chartFail")}
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary h-8 px-3 text-xs"
                      onClick={() => setReloadNonce((n) => n + 1)}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />{" "}
                      {t("common.tryAgain")}
                    </button>
                  </div>
                ) : points.length === 0 ? (
                  <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                    {t("tankDetail.noReadings24h")}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart
                      data={points}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148,163,184,0.25)"
                      />
                      <XAxis
                        dataKey="bucket"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: string) =>
                          new Date(v).toLocaleTimeString(currentLocale(), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }
                        stroke="rgba(148,163,184,0.8)"
                      />
                      <YAxis
                        domain={[0, yMax > 0 ? yMax : "auto"]}
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) =>
                          (getUnitSystem() === "imperial"
                            ? v * FT_PER_M
                            : v
                          ).toLocaleString(currentLocale(), {
                            maximumFractionDigits: 1,
                          })
                        }
                        stroke="rgba(148,163,184,0.8)"
                      />
                      <ChartTooltip
                        formatter={(value: unknown) => [
                          `${levelValue(Number(value))} ${unitSuffixes().level}`,
                          t("common.avgLevel"),
                        ]}
                        labelFormatter={(v: string) =>
                          new Date(v).toLocaleString(currentLocale(), {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        }
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid rgba(148,163,184,0.4)",
                          background: "rgba(255,255,255,0.95)",
                          color: "#0f172a",
                          fontSize: 12,
                        }}
                      />
                      {isFinite(maxLevel) && (
                        <ReferenceLine
                          y={maxLevel}
                          stroke="#f59e0b"
                          strokeDasharray="4 4"
                          label={{
                            value: t("tankCard.thresholdMax").toLowerCase(),
                            position: "insideTopRight",
                            fontSize: 10,
                            fill: "#f59e0b",
                          }}
                        />
                      )}
                      {isFinite(overflow) && (
                        <ReferenceLine
                          y={overflow}
                          stroke="#ef4444"
                          strokeDasharray="4 4"
                          label={{
                            value: t("tankCard.thresholdOverflow").toLowerCase(),
                            position: "insideTopRight",
                            fontSize: 10,
                            fill: "#ef4444",
                          }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="level"
                        name={t("common.avgLevel")}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Section>

            {/* Dimensões e thresholds */}
            <Section title={t("tankDetail.sectionDims")}>
              <div className="grid grid-cols-3 gap-2">
                <Metric label={t("tankDetail.height")}>
                  {formatMeters(tank?.dimensions?.height, 1)}
                </Metric>
                <Metric label={t("tankDetail.diameter")}>
                  {tank?.dimensions?.diameter != null
                    ? formatDimension(tank.dimensions.diameter)
                    : "—"}
                </Metric>
                <Metric label={t("tankDetail.volume")}>
                  {formatVolume(tank?.dimensions?.volume)}
                </Metric>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] tabular-nums">
                <div className="rounded bg-orange-100 px-1 py-1 font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-400">
                  {t("tankCard.thresholdMax")}{" "}
                  {formatMeters(tank?.maxLevelThreshold, 1)}
                </div>
                <div className="rounded bg-red-100 px-1 py-1 font-semibold text-red-700 dark:bg-red-950 dark:text-red-400">
                  {t("tankCard.thresholdOverflow")}{" "}
                  {formatMeters(tank?.overflowThreshold, 1)}
                </div>
                <div className="rounded bg-sky-100 px-1 py-1 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                  {t("tankCard.thresholdMin")}{" "}
                  {formatMeters(tank?.minLevelThreshold, 1)}
                </div>
                <div className="rounded bg-sky-100 px-1 py-1 font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-400">
                  {t("tankCard.thresholdLow")}{" "}
                  {formatMeters(tank?.lowLevelThreshold, 1)}
                </div>
              </div>
            </Section>

            {/* Localização */}
            <Section title={t("tankDetail.sectionLocation")}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
                <MapPin className="h-4 w-4 shrink-0 text-red-500" />
                {Number(tank.latitude).toLocaleString(currentLocale(), {
                  minimumFractionDigits: 5,
                })}
                {", "}
                {Number(tank.longitude).toLocaleString(currentLocale(), {
                  minimumFractionDigits: 5,
                })}
              </p>
              {tank.description && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {tank.description}
                </p>
              )}
            </Section>
          </div>
        </aside>
      </div>
    </dialog>
  );
};

export default TankDetailDrawer;
