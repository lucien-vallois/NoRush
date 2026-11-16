import type { Tank, TankForecast } from "../types";

export const OVERFLOW_CRITICAL_H = 6;

export type MarkerColor = "green" | "amber" | "red" | "slate";

export interface TankView {
  tank: Tank;
  forecast?: TankForecast;
  forecastAvailable: boolean;
  level: number | null;
  etaOverflowHours: number | null;
  critical: boolean;
  markerColor: MarkerColor;
}

export function toFinite(value: unknown): number | null {
  const numeric = Number(value);
  return value != null && isFinite(numeric) ? numeric : null;
}

export function buildTankView(
  tank: Tank,
  currentLevel: unknown,
  forecast?: TankForecast,
): TankView {
  const usableForecast = forecast?.dataFresh ? forecast : undefined;
  const eta = usableForecast
    ? toFinite(usableForecast.etaOverflowHours)
    : null;
  const critical = eta != null && eta <= OVERFLOW_CRITICAL_H;

  let markerColor: MarkerColor = "slate";
  if (critical) markerColor = "red";
  else if (tank.status === "maintenance") markerColor = "amber";
  else if (tank.status === "active") markerColor = "green";

  return {
    tank,
    forecast: usableForecast,
    forecastAvailable: usableForecast != null,
    level: toFinite(currentLevel),
    etaOverflowHours: eta,
    critical,
    markerColor,
  };
}
