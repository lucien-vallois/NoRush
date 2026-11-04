/**
 * Estado do sistema de unidades (DOM-free para os testes Node rodarem).
 *
 * `imperial` é o padrão: o console serve o oilfield americano, onde nível
 * é lido em pés e volume em barris (bbl). Os cálculos e o armazenamento
 * permanecem métricos (m/L); a conversão acontece na borda de exibição.
 * Padrão espelhado no módulo de idioma (i18n/language.ts).
 */

export type UnitSystem = "imperial" | "metric";

const STORAGE_KEY = "norush.units";

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial";

export function isUnitSystem(value: string | null): value is UnitSystem {
  return value === "imperial" || value === "metric";
}

function readStored(): UnitSystem {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
    return isUnitSystem(raw) ? raw : DEFAULT_UNIT_SYSTEM;
  } catch {
    return DEFAULT_UNIT_SYSTEM;
  }
}

let current: UnitSystem = readStored();
const listeners = new Set<() => void>();

export function getUnitSystem(): UnitSystem {
  return current;
}

export function setUnitSystem(next: UnitSystem): void {
  if (next === current) return;
  current = next;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // sem localStorage (testes): mantém apenas em memória
  }
  listeners.forEach((fn) => fn());
}

export function toggleUnitSystem(): void {
  setUnitSystem(current === "imperial" ? "metric" : "imperial");
}

export function subscribeUnitSystem(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Sufixos conforme o sistema ativo — usados em cards, tooltips e eixos. */
export function unitSuffixes(): {
  level: string;
  volume: string;
  rate: string;
  rateVolumetric: string;
  capacity: string;
} {
  return current === "imperial"
    ? { level: "ft", volume: "bbl", rate: "ft/h", rateVolumetric: "bbl/h", capacity: "bbl" }
    : { level: "m", volume: "L", rate: "m/h", rateVolumetric: "m³/h", capacity: "m³" };
}
