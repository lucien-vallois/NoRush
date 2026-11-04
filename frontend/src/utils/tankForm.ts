/**
 * Formulário de tanque: conversão do que o operador digita (ft/bbl ou m/L)
 * para o corpo métrico da API, e validação com mensagens i18n.
 * DOM-free para rodar nos testes Node.
 */

export type UnitSystem = "imperial" | "metric";

export const M_PER_FT = 0.3048;
export const L_PER_BBL = 158.9873;
/** Folga de arredondamento ft↔m ao comparar com a altura (1 cm) */
export const HEIGHT_TOLERANCE_M = 0.01;

export interface FieldError {
  key: string;
  params?: Record<string, unknown>;
}

export interface TankFormValues {
  code: string;
  name: string;
  description: string;
  height: string;
  diameter: string;
  latitude: string;
  longitude: string;
  overflow: string;
  high: string;
  low: string;
  min: string;
  strapping: string;
  status: "active" | "maintenance" | "inactive";
}

export type TankFormErrors = Partial<Record<keyof TankFormValues, FieldError>>;

export interface TankPayload {
  code: string;
  name: string;
  description?: string;
  dimensions: { height: number; diameter: number };
  arqueacaoTable: { level: number; volume: number }[] | null;
  latitude: number;
  longitude: number;
  overflowThreshold?: number;
  maxLevelThreshold?: number;
  lowLevelThreshold?: number;
  minLevelThreshold?: number;
  status?: TankFormValues["status"];
}

export const EMPTY_TANK_FORM: TankFormValues = {
  code: "",
  name: "",
  description: "",
  height: "",
  diameter: "",
  latitude: "",
  longitude: "",
  overflow: "",
  high: "",
  low: "",
  min: "",
  strapping: "",
  status: "active",
};

/** Número digitado por uma pessoa: aceita "1,5" e "1.5"; vazio → null. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s === "" || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const FT_IN = /^(\d+(?:[.,]\d+)?)\s*(?:'|ft)\s*(?:(\d+(?:[.,]\d+)?)\s*(?:"|in)?)?$/i;

/**
 * Comprimento no sistema ativo → metros. No imperial aceita pés decimais
 * ("20.5") ou pés e polegadas como no gauge chart ("20'6\"", "20' 6", "20 ft 6 in").
 */
export function parseLength(raw: string, system: UnitSystem): number | null {
  const s = raw.trim();
  if (system === "imperial") {
    const m = FT_IN.exec(s);
    if (m) {
      const ft = parseNumber(m[1]);
      const inches = m[2] ? parseNumber(m[2]) : 0;
      if (ft == null || inches == null || inches >= 12) return null;
      return (ft + inches / 12) * M_PER_FT;
    }
    const ft = parseNumber(s);
    return ft == null ? null : ft * M_PER_FT;
  }
  return parseNumber(s);
}

/** Metros → texto editável no sistema ativo. */
export function lengthToInput(
  meters: number | null | undefined,
  system: UnitSystem,
  digits = 2,
): string {
  if (meters == null || !Number.isFinite(Number(meters))) return "";
  const v = system === "imperial" ? Number(meters) / M_PER_FT : Number(meters);
  return String(Number(v.toFixed(digits)));
}

export function volumeToLiters(value: number, system: UnitSystem): number {
  return system === "imperial" ? value * L_PER_BBL : value;
}

export function litersToVolume(liters: number, system: UnitSystem): number {
  return system === "imperial" ? liters / L_PER_BBL : liters;
}

export interface StrappingParse {
  rows: { level: number; volume: number }[];
  /** Primeira linha (1-based) que não pôde ser lida; null se tudo ok */
  errorLine: number | null;
}

/**
 * Tabela de arqueação colada pelo operador: uma linha por ponto, "nível volume"
 * separados por tab, ponto e vírgula, espaço ou vírgula. Nível em ft (aceita
 * ft-in) ou m; volume em bbl ou L. Linhas vazias, comentários (#) e um
 * cabeçalho sem números são ignorados.
 */
export function parseStrappingTable(
  text: string,
  system: UnitSystem,
): StrappingParse {
  const rows: StrappingParse["rows"] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "" || line.startsWith("#")) continue;
    if (rows.length === 0 && !/\d/.test(line)) continue; // cabeçalho

    let tokens = /[\t;]/.test(line)
      ? line.split(/[\t;]+/)
      : line.split(/\s+/);
    if (tokens.length === 1 && line.split(",").length === 2) {
      tokens = line.split(",");
    }
    tokens = tokens.map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) return { rows, errorLine: i + 1 };

    const volumeRaw = parseNumber(tokens[tokens.length - 1]);
    const level = parseLength(tokens.slice(0, -1).join(" "), system);
    if (volumeRaw == null || level == null || level < 0 || volumeRaw < 0) {
      return { rows, errorLine: i + 1 };
    }
    rows.push({
      level: Math.round(level * 10000) / 10000,
      volume: Math.round(volumeToLiters(volumeRaw, system) * 1000) / 1000,
    });
  }
  return { rows, errorLine: null };
}

/** Capacidade nominal (L): último ponto da tabela ou cilindro vertical. */
export function nominalCapacityLiters(
  heightM: number,
  diameterM: number,
  table?: { level: number; volume: number }[] | null,
): number {
  if (table && table.length > 0) return table[table.length - 1].volume;
  const r = diameterM / 2;
  return Math.PI * r * r * heightM * 1000;
}

/**
 * Limites sugeridos a partir da altura (ponto de partida, não regra):
 * transbordo 92%, alto 85%, baixo 10%, mínimo 5%.
 */
export function suggestThresholds(heightM: number): {
  overflow: number;
  high: number;
  low: number;
  min: number;
} {
  return {
    overflow: heightM * 0.92,
    high: heightM * 0.85,
    low: heightM * 0.1,
    min: heightM * 0.05,
  };
}

export function tankToFormValues(
  tank: {
    code: string;
    name: string;
    description?: string | null;
    dimensions?: { height?: number; diameter?: number } | null;
    arqueacaoTable?: { level: number; volume: number }[] | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    overflowThreshold?: number | null;
    maxLevelThreshold?: number | null;
    lowLevelThreshold?: number | null;
    minLevelThreshold?: number | null;
    status?: string;
  },
  system: UnitSystem,
): TankFormValues {
  const vol = (l: number) => {
    const v = litersToVolume(Number(l), system);
    return String(Number(v.toFixed(system === "imperial" ? 2 : 1)));
  };
  const strapping = (tank.arqueacaoTable ?? [])
    .map((p) => `${lengthToInput(p.level, system, 3)}\t${vol(p.volume)}`)
    .join("\n");
  const status =
    tank.status === "maintenance" || tank.status === "inactive"
      ? tank.status
      : "active";
  return {
    code: tank.code ?? "",
    name: tank.name ?? "",
    description: tank.description ?? "",
    height: lengthToInput(tank.dimensions?.height, system, 3),
    diameter: lengthToInput(tank.dimensions?.diameter, system, 3),
    latitude: tank.latitude != null ? String(Number(tank.latitude)) : "",
    longitude: tank.longitude != null ? String(Number(tank.longitude)) : "",
    overflow: lengthToInput(tank.overflowThreshold, system),
    high: lengthToInput(tank.maxLevelThreshold, system),
    low: lengthToInput(tank.lowLevelThreshold, system),
    min: lengthToInput(tank.minLevelThreshold, system),
    strapping,
    status,
  };
}

/** Valida o formulário e monta o corpo métrico da API (null se houver erro). */
export function validateTankForm(
  values: TankFormValues,
  system: UnitSystem,
): { errors: TankFormErrors; payload: TankPayload | null } {
  const errors: TankFormErrors = {};
  const required = (field: keyof TankFormValues) => {
    if (String(values[field]).trim() === "") {
      errors[field] = { key: "tankForm.errRequired" };
      return false;
    }
    return true;
  };

  required("code");
  required("name");

  let height: number | null = null;
  if (required("height")) {
    height = parseLength(values.height, system);
    if (height == null || height <= 0 || height > 40) {
      errors.height = { key: "tankForm.errPositive" };
      height = null;
    }
  }
  let diameter: number | null = null;
  if (required("diameter")) {
    diameter = parseLength(values.diameter, system);
    if (diameter == null || diameter <= 0 || diameter > 40) {
      errors.diameter = { key: "tankForm.errPositive" };
      diameter = null;
    }
  }

  let latitude: number | null = null;
  if (required("latitude")) {
    latitude = parseNumber(values.latitude);
    if (latitude == null || latitude < -90 || latitude > 90) {
      errors.latitude = { key: "tankForm.errLatitude" };
    }
  }
  let longitude: number | null = null;
  if (required("longitude")) {
    longitude = parseNumber(values.longitude);
    if (longitude == null || longitude < -180 || longitude > 180) {
      errors.longitude = { key: "tankForm.errLongitude" };
    }
  }

  // Limites (opcionais): cada um numérico, dentro da altura e em ordem
  const limitFields = ["min", "low", "high", "overflow"] as const;
  const limits: Partial<Record<(typeof limitFields)[number], number>> = {};
  for (const f of limitFields) {
    if (values[f].trim() === "") continue;
    const v = parseLength(values[f], system);
    if (v == null || v < 0) {
      errors[f] = { key: "tankForm.errNumber" };
      continue;
    }
    if (height != null && v > height + HEIGHT_TOLERANCE_M) {
      errors[f] = { key: "tankForm.errAboveHeight" };
      continue;
    }
    limits[f] = v;
  }
  const order = limitFields.filter((f) => limits[f] != null);
  for (let i = 1; i < order.length; i++) {
    const prev = limits[order[i - 1]]!;
    const cur = limits[order[i]]!;
    const strict = order[i - 1] === "low" && order[i] === "high";
    if (strict ? cur <= prev : cur < prev - 1e-9) {
      errors[order[i]] = { key: "tankForm.errOrder" };
      break;
    }
  }

  // Tabela de arqueação (opcional)
  let table: TankPayload["arqueacaoTable"] = null;
  if (values.strapping.trim() !== "") {
    const parsed = parseStrappingTable(values.strapping, system);
    if (parsed.errorLine != null) {
      errors.strapping = {
        key: "tankForm.errStrappingLine",
        params: { line: parsed.errorLine },
      };
    } else if (parsed.rows.length < 2) {
      errors.strapping = { key: "tankForm.errStrappingRows" };
    } else {
      const bad = parsed.rows.findIndex(
        (r, i) =>
          (height != null && r.level > height + HEIGHT_TOLERANCE_M) ||
          (i > 0 &&
            (r.level <= parsed.rows[i - 1].level ||
              r.volume < parsed.rows[i - 1].volume)),
      );
      if (bad >= 0) {
        errors.strapping = {
          key: "tankForm.errStrappingOrder",
          params: { row: bad + 1 },
        };
      } else {
        // dentro da folga, o último ponto não passa da altura cadastrada
        table = parsed.rows.map((r) =>
          height != null && r.level > height ? { ...r, level: height } : r,
        );
      }
    }
  }

  if (Object.keys(errors).length > 0) return { errors, payload: null };

  const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
  const payload: TankPayload = {
    code: values.code.trim(),
    name: values.name.trim(),
    dimensions: { height: round(height!), diameter: round(diameter!) },
    arqueacaoTable: table?.map((r) => ({ level: Math.min(round(r.level), round(height!)), volume: r.volume })) ?? null,
    latitude: latitude!,
    longitude: longitude!,
    status: values.status,
  };
  if (values.description.trim()) payload.description = values.description.trim();
  // Limites guardados com 1 cm de resolução (decimal(5,2) no banco)
  const cap = (v: number) => Math.min(round(v, 2), Math.floor(height! * 100) / 100);
  if (limits.overflow != null) payload.overflowThreshold = cap(limits.overflow);
  if (limits.high != null) payload.maxLevelThreshold = cap(limits.high);
  if (limits.low != null) payload.lowLevelThreshold = cap(limits.low);
  if (limits.min != null) payload.minLevelThreshold = cap(limits.min);
  return { errors, payload };
}
