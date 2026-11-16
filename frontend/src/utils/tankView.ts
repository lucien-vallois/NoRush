import type { Tank, TankForecast } from "../types";

export const OVERFLOW_CRITICAL_H = 6;

export type MarkerColor = "green" | "amber" | "orange" | "red" | "slate";

export interface TankView {
  tank: Tank;
  forecast?: TankForecast;
  forecastAvailable: boolean;
  level: number | null;
  etaOverflowHours: number | null;
  critical: boolean;
  criticalAlarmOpen: boolean;
  aboveOperationalLimit: boolean;
  communicationFailed: boolean;
  markerColor: MarkerColor;
}

interface TankViewOptions {
  criticalAlarmOpen?: boolean;
  now?: number;
}

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;

export function toFinite(value: unknown): number | null {
  const numeric = Number(value);
  return value != null && isFinite(numeric) ? numeric : null;
}

export function buildTankView(
  tank: Tank,
  currentLevel: unknown,
  forecast?: TankForecast,
  options: TankViewOptions = {},
): TankView {
  const usableForecast = forecast?.dataFresh ? forecast : undefined;
  const eta = usableForecast
    ? toFinite(usableForecast.etaOverflowHours)
    : null;
  const critical = eta != null && eta <= OVERFLOW_CRITICAL_H;
  const level = toFinite(currentLevel);
  const operationalLimit = toFinite(tank.maxLevelThreshold);
  const aboveOperationalLimit =
    level != null && operationalLimit != null && level >= operationalLimit;
  const criticalAlarmOpen = options.criticalAlarmOpen ?? false;
  const now = options.now ?? Date.now();
  const activeSensors = (tank.sensors ?? []).filter(
    (sensor) => sensor.status === "active",
  );
  const communicationFailed =
    tank.status === "active" &&
    (activeSensors.length === 0 ||
      activeSensors.every((sensor) => {
        if (!sensor.lastTransmissionAt) return true;
        const age = now - new Date(sensor.lastTransmissionAt).getTime();
        return !Number.isFinite(age) || age < 0 || age >= HEARTBEAT_TIMEOUT_MS;
      }));

  let markerColor: MarkerColor = "slate";
  if (criticalAlarmOpen) markerColor = "red";
  else if (aboveOperationalLimit) markerColor = "orange";
  else if (communicationFailed) markerColor = "slate";
  else if (critical || tank.status === "maintenance") markerColor = "amber";
  else if (tank.status === "active") markerColor = "green";

  return {
    tank,
    forecast: usableForecast,
    forecastAvailable: usableForecast != null,
    level,
    etaOverflowHours: eta,
    critical,
    criticalAlarmOpen,
    aboveOperationalLimit,
    communicationFailed,
    markerColor,
  };
}
