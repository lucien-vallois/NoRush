import { currentLocale, translateKey } from "../i18n/language.ts";

/**
 * Formata horas no padrão "XhYY" (ex.: 4.2 → "4h12").
 * Abaixo de 1h mostra minutos (ex.: 0.75 → "45min").
 */
export function formatHours(hours: number): string {
  if (!isFinite(hours)) return "—";
  if (hours <= 0) return translateKey("common.now");
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return `${mins}min`;
  }
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 60) return `${h + 1}h00`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** "12:11:27" a partir de um timestamp ISO (hora local) */
export function formatTimeOfDay(timestamp: string | number | Date): string {
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString(currentLocale(), { hour12: false });
}

/** Difererença relativa compacta: "há 4s", "há 2min" */
export function formatElapsed(
  sinceMs: number,
  nowMs: number = Date.now(),
): string {
  const s = Math.max(0, Math.round((nowMs - sinceMs) / 1000));
  if (s < 60) return translateKey("common.ago", { value: `${s}s` });
  const m = Math.floor(s / 60);
  if (m < 60) return translateKey("common.ago", { value: `${m}min` });
  const h = Math.floor(m / 60);
  return translateKey("common.ago", { value: `${h}h` });
}

/** Número com sinal explícito: +0.31 / −2.50 (separador conforme idioma) */
export function formatSigned(value: number, decimals = 2): string {
  const abs = Math.abs(value).toLocaleString(currentLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${value < 0 ? "−" : "+"}${abs}`;
}

// NIST SP 811 conversion factors; bbl denotes the 42-US-gallon petroleum barrel.
export function formatFeet(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return "—";
  return `${(meters / 0.3048).toLocaleString(currentLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ft`;
}

export function formatBarrels(liters: number | null | undefined): string {
  if (liters == null || !Number.isFinite(liters)) return "—";
  return `${(liters / 158.9873).toLocaleString(currentLocale(), { maximumFractionDigits: 1 })} bbl`;
}

/** Número genérico no idioma ativo (separador decimal/milhar localizado) */
export function formatNumber(
  value: number,
  digits = 0,
): string {
  return value.toLocaleString(currentLocale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
