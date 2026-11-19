import type {
  OilWaterInterface,
  Tank,
  TankForecast,
  TankOperationalState,
} from "../types";

export const OVERFLOW_CRITICAL_H = 6;

export type MarkerColor = "green" | "amber" | "orange" | "red" | "slate";

export interface TankView {
  tank: Tank;
  tankStatus: Tank["status"];
  sensorId: string | null;
  oilWaterInterface: OilWaterInterface | null;
  readingTimestamp: string | null;
  readingFresh: boolean;
  forecast?: TankForecast;
  forecastAvailable: boolean;
  level: number | null;
  etaOverflowHours: number | null;
  critical: boolean;
  criticalAlarmOpen: boolean;
  aboveOperationalLimit: boolean;
  communicationFailed: boolean;
  atRisk: boolean;
  markerColor: MarkerColor;
}

export function toFinite(value: unknown): number | null {
  const numeric = Number(value);
  return value != null && isFinite(numeric) ? numeric : null;
}

export function tankChartYMax(tank: Tank, maxLevelPoint: number): number {
  const height = toFinite(tank.dimensions?.height);
  const overflow = toFinite(tank.overflowThreshold);
  const maxLevel = toFinite(tank.maxLevelThreshold);
  return Math.max(
    height != null && height > 0 ? height : 0,
    overflow ?? 0,
    maxLevel ?? 0,
    Number.isFinite(maxLevelPoint) ? maxLevelPoint * 1.1 : 0,
  );
}

export function buildTankView(
  tank: Tank,
  state?: TankOperationalState,
): TankView {
  const level = toFinite(state?.level);
  const readingFresh = state?.readingFreshness.fresh === true;
  const usableForecast =
    readingFresh &&
    state.forecastError !== true &&
    state.forecast?.dataFresh === true &&
    state.forecast.sensorId === state.sensorId &&
    state.forecast.lastReadingAt === state.readingTimestamp
      ? state.forecast
      : undefined;
  const eta = usableForecast
    ? toFinite(usableForecast.etaOverflowHours)
    : null;
  const critical = eta != null && eta <= OVERFLOW_CRITICAL_H;
  const operationalLimit = toFinite(tank.maxLevelThreshold);
  const aboveOperationalLimit =
    readingFresh &&
    level != null &&
    operationalLimit != null &&
    level >= operationalLimit;
  const criticalAlarmOpen = state?.criticalAlarmOpen === true;
  const tankStatus = state?.tankStatus ?? tank.status;
  const communicationFailed =
    tankStatus === "active" && state?.heartbeat.fresh !== true;
  const atRisk = criticalAlarmOpen || aboveOperationalLimit || critical;

  let markerColor: MarkerColor = "slate";
  if (criticalAlarmOpen) markerColor = "red";
  else if (aboveOperationalLimit) markerColor = "orange";
  else if (tankStatus === "maintenance") markerColor = "amber";
  else if (!readingFresh || level == null || communicationFailed) {
    markerColor = "slate";
  } else if (critical) markerColor = "amber";
  else if (tankStatus === "active") markerColor = "green";

  return {
    tank,
    tankStatus,
    sensorId: state?.sensorId ?? null,
    oilWaterInterface: state?.oilWaterInterface ?? null,
    readingTimestamp: state?.readingTimestamp ?? null,
    readingFresh,
    forecast: usableForecast,
    forecastAvailable: usableForecast != null,
    level,
    etaOverflowHours: eta,
    critical,
    criticalAlarmOpen,
    aboveOperationalLimit,
    communicationFailed,
    atRisk,
    markerColor,
  };
}

const MARKER_PRIORITY: Record<MarkerColor, number> = {
  red: 0,
  orange: 1,
  amber: 2,
  slate: 3,
  green: 4,
};

export function sortTankViews(a: TankView, b: TankView): number {
  const markerOrder = MARKER_PRIORITY[a.markerColor] - MARKER_PRIORITY[b.markerColor];
  if (markerOrder !== 0) return markerOrder;
  if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
  const ea = a.etaOverflowHours ?? Number.POSITIVE_INFINITY;
  const eb = b.etaOverflowHours ?? Number.POSITIVE_INFINITY;
  if (ea !== eb) return ea - eb;
  return a.tank.code.localeCompare(b.tank.code);
}
