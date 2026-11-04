/**
 * Decodificação de registradores Modbus (16 bits) em valores físicos.
 *
 * Ordem dos 32 bits (A = byte mais significativo):
 *   ABCD — palavra alta primeiro (o padrão Modbus "big-endian")
 *   CDAB — palavra baixa primeiro (word swap, comum em gateways de campo)
 *   BADC / DCBA — variantes com bytes trocados, raras
 */

export const WORD_ORDERS = ["ABCD", "CDAB", "BADC", "DCBA"];

const swapBytes = (w) => ((w & 0xff) << 8) | ((w >> 8) & 0xff);

/** Dois registradores → 4 bytes na ordem ABCD, conforme a ordem do equipamento. */
function toAbcd(r0, r1, order) {
  switch (order) {
    case "ABCD":
      return [r0, r1];
    case "CDAB":
      return [r1, r0];
    case "BADC":
      return [swapBytes(r0), swapBytes(r1)];
    case "DCBA":
      return [swapBytes(r1), swapBytes(r0)];
    default:
      throw new Error(`unknown word order: ${order}`);
  }
}

export function decodeFloat32(r0, r1, order = "ABCD") {
  const [hi, lo] = toAbcd(r0, r1, order);
  const view = new DataView(new ArrayBuffer(4));
  view.setUint16(0, hi);
  view.setUint16(2, lo);
  return view.getFloat32(0);
}

export function decodeInt32(r0, r1, order = "ABCD", signed = true) {
  const [hi, lo] = toAbcd(r0, r1, order);
  const view = new DataView(new ArrayBuffer(4));
  view.setUint16(0, hi);
  view.setUint16(2, lo);
  return signed ? view.getInt32(0) : view.getUint32(0);
}

export function decodeInt16(r) {
  return r & 0x8000 ? r - 0x10000 : r;
}

/** Fator para metros, ou null se a unidade não for de comprimento. */
const LENGTH_TO_M = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };

export function toMeters(value, unit) {
  const k = LENGTH_TO_M[unit];
  if (k == null) throw new Error(`unit ${unit} is not a length`);
  return value * k;
}

export function toCelsius(value, unit) {
  if (unit === "degC") return value;
  if (unit === "degF") return ((value - 32) * 5) / 9;
  throw new Error(`unit ${unit} is not a temperature`);
}

export function isLengthUnit(unit) {
  return unit in LENGTH_TO_M;
}

/**
 * Lê um valor de um mapa endereço → registrador (já lido do equipamento).
 * Retorna o número decodificado, aplicando `scale` e `offset` se houver.
 */
export function readValue(registers, def, order) {
  const get = (addr) => {
    const v = registers.get(addr);
    if (v === undefined) throw new Error(`register ${addr} was not read`);
    return v;
  };
  let raw;
  switch (def.type) {
    case "float32":
      raw = decodeFloat32(get(def.address), get(def.address + 1), order);
      break;
    case "int32":
      raw = decodeInt32(get(def.address), get(def.address + 1), order, true);
      break;
    case "uint32":
      raw = decodeInt32(get(def.address), get(def.address + 1), order, false);
      break;
    case "int16":
      raw = decodeInt16(get(def.address));
      break;
    case "uint16":
      raw = get(def.address);
      break;
    default:
      throw new Error(`unknown register type ${def.type}`);
  }
  return raw * (def.scale ?? 1) + (def.offset ?? 0);
}

/**
 * Descobre a ordem dos 32 bits usando um valor de faixa conhecida (no Float
 * Stick, a extensão da haste em polegadas). Retorna a única ordem plausível,
 * ou null quando nenhuma ou mais de uma bate — nesse caso o instalador
 * precisa definir `wordOrder` na configuração.
 */
export function detectWordOrder(registers, def, min, max) {
  const plausible = ["ABCD", "CDAB"].filter((order) => {
    const v = readValue(registers, def, order);
    return Number.isFinite(v) && v >= min && v <= max;
  });
  return plausible.length === 1 ? plausible[0] : null;
}
