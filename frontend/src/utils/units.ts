import { currentLocale } from "../i18n/language.ts";
import {
  getUnitSystem,
  unitSuffixes,
  type UnitSystem,
} from "../i18n/units.ts";

/**
 * Formatação de grandezas no sistema de unidades ativo.
 * Conversões NIST SP 811: 1 ft = 0,3048 m; 1 bbl = 158,9873 L (42 gal EUA).
 * O armazenamento/ API permanece métrico; a conversão é só de exibição.
 */

export const FT_PER_M = 1 / 0.3048;
export const L_PER_BBL = 158.9873;

const imperial = (): boolean => getUnitSystem() === "imperial";

function localeFmt(
  value: number,
  min: number,
  max: number,
): string {
  return value.toLocaleString(currentLocale(), {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  });
}

/** Nível: m → ft (imperial). `digits` aplica-se à unidade exibida. */
export function formatLevel(
  meters: number | null | undefined,
  digits = 2,
): string {
  if (meters == null || !Number.isFinite(Number(meters))) return "—";
  const v = Number(meters);
  return imperial()
    ? `${localeFmt(v * FT_PER_M, digits, digits)} ft`
    : `${localeFmt(v, digits, digits)} m`;
}

/** Só o número, já convertido (eixos de gráfico, tooltips custom). */
export function levelValue(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(Number(meters))) return "—";
  const v = Number(meters);
  return imperial() ? localeFmt(v * FT_PER_M, 2, 2) : localeFmt(v, 2, 2);
}

/** Dimensões (altura/diâmetro do tanque): 1 casa decimal. */
export function formatDimension(
  meters: number | null | undefined,
  digits = 1,
): string {
  if (meters == null || !Number.isFinite(Number(meters))) return "—";
  const v = Number(meters);
  return imperial()
    ? `${localeFmt(v * FT_PER_M, digits, digits)} ft`
    : `${localeFmt(v, digits, digits)} m`;
}

/**
 * Volume armazenado em litros pela API: imperial mostra bbl;
 * métrico preserva "L (~m³)".
 */
export function formatVolumeL(
  liters: number | null | undefined,
): string {
  if (liters == null || !Number.isFinite(Number(liters))) return "—";
  const v = Number(liters);
  if (imperial()) return `${localeFmt(v / L_PER_BBL, 0, 1)} bbl`;
  const l = localeFmt(v, 0, 0);
  const m3 = localeFmt(v / 1000, 1, 1);
  return `${l} L (~${m3} m³)`;
}

/** Capacidade/total em m³ vindo da API: imperial → bbl. */
export function formatCapacityM3(
  m3: number | null | undefined,
): string {
  if (m3 == null || !Number.isFinite(Number(m3))) return "—";
  const v = Number(m3);
  return imperial()
    ? `${localeFmt((v * 1000) / L_PER_BBL, 1, 1)} bbl`
    : `${localeFmt(v, 1, 1)} m³`;
}

/** Ritmo de nível (m/h): imperial → ft/h. */
export function formatRateMH(
  mPerH: number | null | undefined,
  digits = 2,
): string {
  if (mPerH == null || !Number.isFinite(Number(mPerH))) return "—";
  const v = Number(mPerH);
  const sign = v < 0 ? "−" : "+";
  return imperial()
    ? `${sign}${localeFmt(Math.abs(v) * FT_PER_M, digits, digits)} ft/h`
    : `${sign}${localeFmt(Math.abs(v), digits, digits)} m/h`;
}

/** Ritmo volumétrico (m³/h): imperial → bbl/h. */
export function formatRateM3H(
  m3PerH: number | null | undefined,
): string {
  if (m3PerH == null || !Number.isFinite(Number(m3PerH))) return "—";
  const v = Number(m3PerH);
  const sign = v < 0 ? "−" : "+";
  return imperial()
    ? `${sign}${localeFmt((Math.abs(v) * 1000) / L_PER_BBL, 1, 1)} bbl/h`
    : `${sign}${localeFmt(Math.abs(v), 1, 1)} m³/h`;
}

const M_PER_IN = 0.0254;

/** Feet and inches to the nearest quarter inch, as a hand gauge reads: 12' 4 1/2". */
export function formatFeetInches(meters: number): string {
  const quarters = Math.round((Math.max(0, meters) / M_PER_IN) * 4);
  const feet = Math.floor(quarters / 48);
  const rest = quarters - feet * 48;
  const inches = Math.floor(rest / 4);
  const fraction = ["", " 1/4", " 1/2", " 3/4"][rest % 4];
  return `${feet}' ${inches}${fraction}"`;
}

/** Gauge reading in the report: ft-in (imperial) or meters with 3 decimals. */
export function formatGauge(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(Number(meters))) return "—";
  return imperial() ? formatFeetInches(Number(meters)) : localeFmt(Number(meters), 3, 3);
}

/** Report volume without the unit (it goes in the column header): bbl or m³. */
export function reportVolume(liters: number | null | undefined): string {
  if (liters == null || !Number.isFinite(Number(liters))) return "—";
  const v = Number(liters);
  return imperial() ? localeFmt(v / L_PER_BBL, 1, 1) : localeFmt(v / 1000, 2, 2);
}

export function reportUnits(): { level: string; volume: string } {
  return imperial() ? { level: "ft-in", volume: "bbl" } : { level: "m", volume: "m³" };
}

export {
  getUnitSystem,
  unitSuffixes,
  type UnitSystem,
};
