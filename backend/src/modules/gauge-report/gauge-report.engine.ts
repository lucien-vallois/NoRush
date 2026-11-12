/**
 * Gauge report engine: opening and closing gauges, and oil and water
 * produced and removed per tank, for a gauge day (24 h) or a 12-hour shift.
 *
 * Pure functions, no database: the service feeds them readings and tanks.
 * Everything here is SI (meters, liters, epoch milliseconds); unit
 * conversion happens at the edges (CSV, console).
 *
 * How the figures are derived from a continuous gauge:
 * - Opening/closing: median of the readings within ±10 min of the boundary,
 *   or the nearest reading within ±30 min, or nothing.
 * - Removed: drops in a layer's volume larger than the deadband (2 in of
 *   level by default), such as a haul, a transfer or draining the water leg.
 *   The level is median-filtered first so gauge noise is not counted.
 * - Produced: closing − opening + removed, so the three always reconcile.
 */

export type ReportPeriodKind = 'daily' | 'day' | 'night';

export interface GaugeSample {
  /** epoch ms */
  t: number;
  /** total liquid level from the tank bottom, m */
  level: number;
  /** oil/water interface height from the tank bottom, m (null: single-float gauge) */
  interfaceLevel: number | null;
}

export interface StrappingPoint {
  level: number;
  volume: number;
}

/** level (m) → volume (L) */
export type VolumeFn = (level: number) => number;

export const M_PER_IN = 0.0254;
export const L_PER_BBL = 158.987294928;
export const DEFAULT_DEADBAND_IN = 2;
const BOUNDARY_WINDOW_MS = 10 * 60_000;
const BOUNDARY_TOLERANCE_MS = 30 * 60_000;
const MEDIAN_WINDOW = 5;

// ---------------------------------------------------------------------------
// Volumes
// ---------------------------------------------------------------------------

/** Strapping table when the tank has one (linear interpolation, clamped), otherwise a vertical cylinder. */
export function makeVolumeFn(
  dimensions: { height?: number; diameter?: number } | null | undefined,
  strapping?: StrappingPoint[] | null,
): VolumeFn {
  const table = (strapping ?? [])
    .map((p) => ({ level: Number(p.level), volume: Number(p.volume) }))
    .filter((p) => Number.isFinite(p.level) && Number.isFinite(p.volume))
    .sort((a, b) => a.level - b.level);
  if (table.length >= 2) {
    return (level: number) => {
      if (level <= table[0].level) return table[0].volume;
      const last = table[table.length - 1];
      if (level >= last.level) return last.volume;
      for (let i = 0; i < table.length - 1; i++) {
        const a = table[i];
        const b = table[i + 1];
        if (level >= a.level && level <= b.level) {
          const span = b.level - a.level;
          return span > 0
            ? a.volume + ((level - a.level) / span) * (b.volume - a.volume)
            : a.volume;
        }
      }
      return last.volume;
    };
  }
  const radius = Number(dimensions?.diameter ?? 0) / 2;
  const area = Math.PI * radius * radius;
  return (level: number) => Math.max(0, level) * area * 1000;
}

/** Volume of `inches` of level at the tank's average cross-section. */
export function deadbandLiters(
  volume: VolumeFn,
  height: number,
  inches = DEFAULT_DEADBAND_IN,
): number {
  if (!(height > 0)) return 0;
  const perMeter = (volume(height) - volume(0)) / height;
  return Math.max(0, perMeter * inches * M_PER_IN);
}

// ---------------------------------------------------------------------------
// Time zones and periods
// ---------------------------------------------------------------------------

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface WallTime {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

function wallTime(utcMs: number, tz: string): WallTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    y: get('year'),
    m: get('month'),
    d: get('day'),
    h: get('hour'),
    mi: get('minute'),
  };
}

/** Local-minus-UTC offset of `tz` at that instant, in ms. */
function offsetMs(utcMs: number, tz: string): number {
  const minute = Math.floor(utcMs / 60_000) * 60_000;
  const w = wallTime(minute, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - minute;
}

/** The UTC instant of a local wall-clock hour in `tz` (handles daylight saving). */
export function zonedHourToUtc(
  y: number,
  m: number,
  d: number,
  hour: number,
  tz: string,
): number {
  const guess = Date.UTC(y, m - 1, d, hour);
  const first = offsetMs(guess, tz);
  const candidate = guess - first;
  const second = offsetMs(candidate, tz);
  return second === first ? candidate : guess - second;
}

function parseDate(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  )
    return null;
  return { y, m, d };
}

export function isValidDate(date: string): boolean {
  return parseDate(date) !== null;
}

function addDays(date: { y: number; m: number; d: number }, days: number) {
  const t = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function formatDate(date: { y: number; m: number; d: number }): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

/**
 * Period boundaries for gauge day `date` (the local date the gauge day starts on):
 * - daily: startHour → startHour next day;
 * - day: the first 12 hours; night: the last 12 hours.
 * On daylight-saving days a gauge day is 23 or 25 hours, as on the pad's clock.
 */
export function periodBounds(
  kind: ReportPeriodKind,
  date: string,
  startHour: number,
  tz: string,
): { start: number; end: number } {
  const day = parseDate(date);
  if (!day) throw new Error(`Invalid date: ${date}`);
  const at = (base: { y: number; m: number; d: number }, hour: number) => {
    const shifted = hour >= 24 ? addDays(base, 1) : base;
    return zonedHourToUtc(shifted.y, shifted.m, shifted.d, hour % 24, tz);
  };
  const next = addDays(day, 1);
  const start = at(day, startHour);
  const middle = at(day, startHour + 12);
  const end = at(next, startHour);
  if (kind === 'day') return { start, end: middle };
  if (kind === 'night') return { start: middle, end };
  return { start, end };
}

/** The gauge-day date of the most recent period of this kind that has already ended. */
export function lastCompletedDate(
  kind: ReportPeriodKind,
  nowMs: number,
  startHour: number,
  tz: string,
): string {
  const today = wallTime(nowMs, tz);
  for (let back = 0; back <= 3; back++) {
    const candidate = formatDate(
      addDays({ y: today.y, m: today.m, d: today.d }, -back),
    );
    if (periodBounds(kind, candidate, startHour, tz).end <= nowMs)
      return candidate;
  }
  return formatDate(addDays({ y: today.y, m: today.m, d: today.d }, -3));
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Centered moving median; the window shrinks at the ends. */
export function medianFilter(
  values: number[],
  window = MEDIAN_WINDOW,
): number[] {
  const half = Math.floor(window / 2);
  return values.map((_, i) =>
    median(
      values.slice(
        Math.max(0, i - half),
        Math.min(values.length, i + half + 1),
      ),
    ),
  );
}

export interface BoundaryGauge {
  /** the boundary, or the time of the reading used when none was close */
  at: number;
  level: number;
  interfaceLevel: number | null;
}

/** Gauge at a period boundary: median within ±10 min, else the nearest reading within ±30 min. */
export function gaugeAt(
  samples: GaugeSample[],
  at: number,
): BoundaryGauge | null {
  const near = samples.filter((s) => Math.abs(s.t - at) <= BOUNDARY_WINDOW_MS);
  if (near.length) {
    const interfaces = near
      .map((s) => s.interfaceLevel)
      .filter((v): v is number => v != null);
    return {
      at,
      level: median(near.map((s) => s.level)),
      interfaceLevel: interfaces.length ? median(interfaces) : null,
    };
  }
  let best: GaugeSample | null = null;
  for (const s of samples) {
    const distance = Math.abs(s.t - at);
    if (
      distance <= BOUNDARY_TOLERANCE_MS &&
      (!best || distance < Math.abs(best.t - at))
    )
      best = s;
  }
  return best
    ? { at: best.t, level: best.level, interfaceLevel: best.interfaceLevel }
    : null;
}

export interface RemovalEvent {
  start: number;
  end: number;
  amountL: number;
}

/**
 * Drops larger than `deadbandL` in a volume series. A drop runs from the last
 * point near the peak to the lowest point, and ends when the series climbs
 * back by more than the deadband (or the series ends).
 */
export function detectRemovals(
  series: { t: number; v: number }[],
  deadbandL: number,
): RemovalEvent[] {
  const events: RemovalEvent[] = [];
  if (series.length < 2 || !(deadbandL > 0)) return events;
  let peak = series[0];
  let nearPeakT = series[0].t;
  let trough = series[0];
  let falling = false;
  for (let i = 1; i < series.length; i++) {
    const p = series[i];
    if (!falling) {
      if (p.v >= peak.v) {
        peak = p;
        nearPeakT = p.t;
      } else if (peak.v - p.v > deadbandL) {
        falling = true;
        trough = p;
      } else if (peak.v - p.v <= deadbandL / 2) {
        nearPeakT = p.t;
      }
    } else if (p.v < trough.v) {
      trough = p; // the drop ends the first time it reaches its lowest point
    } else if (p.v - trough.v > deadbandL) {
      events.push({
        start: nearPeakT,
        end: trough.t,
        amountL: peak.v - trough.v,
      });
      peak = p;
      nearPeakT = p.t;
      falling = false;
    }
  }
  if (falling)
    events.push({
      start: nearPeakT,
      end: trough.t,
      amountL: peak.v - trough.v,
    });
  return events;
}

// ---------------------------------------------------------------------------
// Per-tank report
// ---------------------------------------------------------------------------

export type Layer = 'oil' | 'water' | 'total';

export interface LayerFigures {
  /** liters at the opening gauge */
  opening: number | null;
  /** liters at the closing gauge */
  closing: number | null;
  /** liters removed during the period (hauls, transfers, draining) */
  removed: number;
  /** closing − opening + removed; null without both gauges */
  produced: number | null;
}

export interface GaugePoint extends BoundaryGauge {
  totalL: number;
  oilL: number | null;
  waterL: number | null;
}

export interface TankPeriodFigures {
  opening: GaugePoint | null;
  closing: GaugePoint | null;
  /** the gauge reports the oil/water interface */
  hasInterface: boolean;
  total: LayerFigures;
  oil: LayerFigures | null;
  water: LayerFigures | null;
  removals: (RemovalEvent & { layer: Layer })[];
  /** highest level in the period (median-filtered), m */
  maxLevel: number | null;
  /** readings inside the period */
  samples: number;
  /** longest stretch without a reading, including the period edges */
  longestGapMinutes: number;
}

function point(
  gauge: BoundaryGauge | null,
  volume: VolumeFn,
): GaugePoint | null {
  if (!gauge) return null;
  const totalL = volume(gauge.level);
  if (gauge.interfaceLevel == null)
    return { ...gauge, totalL, oilL: null, waterL: null };
  const interfaceLevel = Math.min(
    Math.max(gauge.interfaceLevel, 0),
    gauge.level,
  );
  const waterL = volume(interfaceLevel);
  return { ...gauge, totalL, waterL, oilL: Math.max(0, totalL - waterL) };
}

function figures(
  opening: number | null | undefined,
  closing: number | null | undefined,
  removed: number,
): LayerFigures {
  const open = opening ?? null;
  const close = closing ?? null;
  return {
    opening: open,
    closing: close,
    removed,
    produced: open != null && close != null ? close - open + removed : null,
  };
}

/**
 * Figures for one tank. `samples` must be sorted by time and may include
 * readings just outside the period (they help pick the boundary gauges).
 */
export function buildTankFigures(
  samples: GaugeSample[],
  period: { start: number; end: number },
  volume: VolumeFn,
  deadbandL: number,
): TankPeriodFigures {
  const inside = samples.filter((s) => s.t >= period.start && s.t < period.end);
  const opening = point(gaugeAt(samples, period.start), volume);
  const closing = point(gaugeAt(samples, period.end), volume);

  const stamps = [period.start, ...inside.map((s) => s.t), period.end];
  let longestGap = 0;
  for (let i = 1; i < stamps.length; i++)
    longestGap = Math.max(longestGap, stamps[i] - stamps[i - 1]);

  const level = medianFilter(inside.map((s) => s.level));
  const interfaceKnown =
    inside.length > 0 && inside.every((s) => s.interfaceLevel != null);
  const hasInterface =
    interfaceKnown ||
    (inside.length === 0 &&
      opening?.interfaceLevel != null &&
      closing?.interfaceLevel != null);

  const removals: (RemovalEvent & { layer: Layer })[] = [];
  let total: LayerFigures;
  let oil: LayerFigures | null = null;
  let water: LayerFigures | null = null;

  if (hasInterface) {
    const iface = medianFilter(inside.map((s) => s.interfaceLevel as number));
    const waterSeries = inside.map((s, i) => ({
      t: s.t,
      v: volume(Math.min(iface[i], level[i])),
    }));
    const oilSeries = inside.map((s, i) => ({
      t: s.t,
      v: Math.max(0, volume(level[i]) - waterSeries[i].v),
    }));
    const oilOut = detectRemovals(oilSeries, deadbandL);
    const waterOut = detectRemovals(waterSeries, deadbandL);
    removals.push(...oilOut.map((e) => ({ ...e, layer: 'oil' as const })));
    removals.push(...waterOut.map((e) => ({ ...e, layer: 'water' as const })));
    const sum = (events: RemovalEvent[]) =>
      events.reduce((acc, e) => acc + e.amountL, 0);
    oil = figures(opening?.oilL, closing?.oilL, sum(oilOut));
    water = figures(opening?.waterL, closing?.waterL, sum(waterOut));
    total = figures(
      opening?.totalL,
      closing?.totalL,
      oil.removed + water.removed,
    );
  } else {
    const totalOut = detectRemovals(
      inside.map((s, i) => ({ t: s.t, v: volume(level[i]) })),
      deadbandL,
    );
    removals.push(...totalOut.map((e) => ({ ...e, layer: 'total' as const })));
    total = figures(
      opening?.totalL,
      closing?.totalL,
      totalOut.reduce((acc, e) => acc + e.amountL, 0),
    );
  }

  removals.sort((a, b) => a.start - b.start);
  return {
    opening,
    closing,
    hasInterface,
    total,
    oil,
    water,
    removals,
    maxLevel: level.length ? Math.max(...level) : null,
    samples: inside.length,
    longestGapMinutes: Math.round(longestGap / 60_000),
  };
}

// ---------------------------------------------------------------------------
// Formatting (CSV and logs)
// ---------------------------------------------------------------------------

/** Level as a hand gauge reads it: feet and inches to the nearest quarter inch, e.g. 12' 4 1/2". */
export function formatFeetInches(meters: number): string {
  const quarters = Math.round((Math.max(0, meters) / M_PER_IN) * 4);
  const feet = Math.floor(quarters / 48);
  const rest = quarters - feet * 48;
  const inches = Math.floor(rest / 4);
  const fraction = ['', ' 1/4', ' 1/2', ' 3/4'][rest % 4];
  return `${feet}' ${inches}${fraction}"`;
}
