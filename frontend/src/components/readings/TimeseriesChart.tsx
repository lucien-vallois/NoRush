import React from "react";
import { useTranslation } from "react-i18next";
import { currentLocale } from "../../i18n";
import { FT_PER_M, formatVolumeL, getUnitSystem, unitSuffixes } from "../../utils/units.ts";
import { withTelemetryGaps } from "../../utils/telemetry";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/** Cores fixas (funcionam em tema claro/escuro) */
export const CHART_COLORS = {
  level: "#2563eb", // azul — nível médio
  oil: "#d97706", // âmbar — interface de óleo
  water: "#0891b2", // ciano — camada de água
  grid: "#94a3b8",
  tick: "#64748b",
};

export interface ChartPoint {
  /** epoch ms do bucket */
  t: number;
  /** nível médio no bucket (m) */
  avg: number;
  min: number;
  max: number;
  volume: number | null;
  quality: number | null;
  oil: number | null;
  water: number | null;
  count: number;
}

/** Eixo X: "dd/MM HH:mm" localizado (hora local) */
export function formatTick(t: number): string {
  const d = new Date(t);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(currentLocale(), {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtNum(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString(currentLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Converte nível em metros para a unidade de exibição ativa (ft no imperial). */
export function toDisplay(meters: number | null | undefined): number | null {
  if (meters == null || !isFinite(meters)) return null;
  return getUnitSystem() === "imperial" ? meters * FT_PER_M : meters;
}

/**
 * Decimação LTTB (Largest-Triangle-Three-Buckets): reduz a `threshold`
 * pontos preservando a forma visual e os extremos (máx/mín) da série.
 */
export function decimateSeries(
  data: ChartPoint[],
  threshold = 800,
): ChartPoint[] {
  const n = data.length;
  if (n <= threshold || threshold < 3) return data;

  const sampled: ChartPoint[] = [data[0]];
  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const avgStart = Math.floor((i + 1) * bucketSize) + 1;
    const avgEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);
    const avgLen = Math.max(1, avgEnd - avgStart);
    let avgX = 0;
    let avgY = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      avgX += data[j].t;
      avgY += data[j].avg;
    }
    avgX /= avgLen;
    avgY /= avgLen;

    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);
    const ax = data[a].t;
    const ay = data[a].avg;
    let maxArea = -Infinity;
    let idx = Math.min(rangeStart, n - 1);
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (ax - avgX) * (data[j].avg - ay) - (ax - data[j].t) * (avgY - ay),
      );
      if (area > maxArea) {
        maxArea = area;
        idx = j;
      }
    }
    sampled.push(data[idx]);
    a = idx;
  }

  sampled.push(data[n - 1]);

  // Garante que os extremos globais (máx/mín) sobrevivam à amostragem:
  // se o LTTB os descartou, substitui o ponto amostrado mais próximo
  // (mantendo exatamente `threshold` pontos).
  for (const extIdx of [maxPointIndex(data), minPointIndex(data)]) {
    const extreme = data[extIdx];
    if (sampled.includes(extreme)) continue;
    let pos = sampled.findIndex((p) => p.t > extreme.t);
    if (pos === -1) pos = sampled.length - 1;
    // substitui o vizinho mais próximo no tempo dentre pos-1 / pos
    const left = sampled[pos - 1];
    const right = sampled[pos];
    if (left && (!right || extreme.t - left.t < right.t - extreme.t)) {
      sampled[pos - 1] = extreme;
    } else {
      sampled[pos] = extreme;
    }
  }

  return sampled.sort((a, b) => a.t - b.t);
}

/** Índice do ponto com maior max_level */
function maxPointIndex(data: ChartPoint[]): number {
  let m = 0;
  for (let i = 1; i < data.length; i++) if (data[i].max > data[m].max) m = i;
  return m;
}

/** Índice do ponto com menor min_level */
function minPointIndex(data: ChartPoint[]): number {
  let m = 0;
  for (let i = 1; i < data.length; i++) if (data[i].min < data[m].min) m = i;
  return m;
}

interface TooltipRow {
  color: string;
  label: string;
  value: string;
  strong?: boolean;
}

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}> = ({ active, payload }) => {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const d = new Date(p.t);
  const title = isNaN(d.getTime())
    ? "—"
    : d.toLocaleString(currentLocale(), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  const rows: TooltipRow[] = [
    {
      color: CHART_COLORS.level,
      label: t("common.avgLevel"),
      value: `${fmtNum(toDisplay(p.avg))} ${unitSuffixes().level}`,
      strong: true,
    },
    {
      color: CHART_COLORS.level,
      label: t("readings.tooltipMaxMin"),
      value: `${fmtNum(toDisplay(p.max))} / ${fmtNum(toDisplay(p.min))} ${unitSuffixes().level}`,
    },
  ];
  if (p.oil != null) {
    rows.push({
      color: CHART_COLORS.oil,
      label: t("readings.tooltipOil"),
      value: `${fmtNum(toDisplay(p.oil))} ${unitSuffixes().level}`,
    });
  }
  if (p.water != null) {
    rows.push({
      color: CHART_COLORS.water,
      label: t("readings.tooltipWater"),
      value: `${fmtNum(toDisplay(p.water))} ${unitSuffixes().level}`,
    });
  }
  if (p.volume != null) {
    rows.push({
      color: CHART_COLORS.level,
      label: t("readings.tooltipAvgVolume"),
      value: formatVolumeL(p.volume),
    });
  }
  if (p.quality != null) {
    rows.push({
      color: CHART_COLORS.level,
      label: t("readings.tooltipAvgQuality"),
      value: fmtNum(p.quality, 1),
    });
  }
  rows.push({
    color: CHART_COLORS.tick,
    label: t("readings.tooltipSamples"),
    value: String(p.count),
  });

  return (
    <div className="bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs max-w-[260px]">
      <p className="font-semibold text-foreground mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: r.color }}
              />
              {r.label}
            </span>
            <span
              className={`tabular-nums ${r.strong ? "font-bold text-foreground" : "text-foreground"}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

interface TimeseriesChartProps {
  data: ChartPoint[];
  referenceData: ChartPoint[];
  intervalMs: number;
  /** Sensor que reporta a interface óleo/água (haste de duas boias) */
  showInterface: boolean;
}

const TimeseriesChart: React.FC<TimeseriesChartProps> = ({
  data,
  showInterface,
  intervalMs,
  referenceData,
}) => {
  const { t } = useTranslation();
  const hasInterface =
    showInterface && data.some((p) => p.oil != null || p.water != null);
  const plotData = React.useMemo(
    () => withTelemetryGaps(data, intervalMs, referenceData),
    [data, intervalMs, referenceData],
  );

  return (
    <div className="relative w-full" style={{ height: 360 }}>
      {/* Legenda */}
      <div className="absolute top-1 left-2 z-10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: CHART_COLORS.level }}
          />
          {t("common.avgLevel")}
        </span>
        {hasInterface && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS.oil }}
            />
            {t("readings.tooltipOil")}
          </span>
        )}
        {hasInterface && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS.water }}
            />
            {t("readings.tooltipWater")}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={plotData}
          margin={{ top: 28, right: 12, bottom: 4, left: 0 }}
        >
          <defs>
            <linearGradient id="readingsLevelGrad" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={CHART_COLORS.level}
                stopOpacity={0.28}
              />
              <stop
                offset="100%"
                stopColor={CHART_COLORS.level}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={CHART_COLORS.grid}
            strokeOpacity={0.25}
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={formatTick}
            stroke={CHART_COLORS.grid}
            tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
            tickLine={false}
            minTickGap={56}
          />
          <YAxis
            tickFormatter={(v: number) => fmtNum(toDisplay(v), 1)}
            stroke={CHART_COLORS.grid}
            tick={{ fontSize: 11, fill: CHART_COLORS.tick }}
            tickLine={false}
            width={56}
            domain={[
              0,
              (dataMax: number) =>
                Math.max(1, Math.ceil(dataMax * 1.1 * 10) / 10),
            ]}
            label={{
              value: unitSuffixes().level,
              position: "insideTopLeft",
              fontSize: 11,
              fill: CHART_COLORS.tick,
              dx: 18,
              dy: 8,
            }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: CHART_COLORS.grid, strokeDasharray: "4 4" }}
          />
          <Area
            type="monotone"
            dataKey="avg"
            name={t("common.avgLevel")}
            stroke={CHART_COLORS.level}
            strokeWidth={2}
            fill="url(#readingsLevelGrad)"
            dot={{ r: 1.5, strokeWidth: 0 }}
            activeDot={{ r: 4, strokeWidth: 1 }}
            isAnimationActive={false}
            connectNulls={false}
          />
          {hasInterface && (
            <Line
              type="monotone"
              dataKey="oil"
              name={t("readings.tooltipOil")}
              stroke={CHART_COLORS.oil}
              strokeWidth={1.5}
              dot={{ r: 1.5, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
          {hasInterface && (
            <Line
              type="monotone"
              dataKey="water"
              name={t("readings.tooltipWater")}
              stroke={CHART_COLORS.water}
              strokeWidth={1.5}
              dot={{ r: 1.5, strokeWidth: 0 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TimeseriesChart;
