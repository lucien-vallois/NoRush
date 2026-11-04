import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORD_ORDERS, isLengthUnit } from "./decode.js";

const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "profiles");

const TYPES = new Set(["float32", "int32", "uint32", "int16", "uint16"]);
const WIDTH = { float32: 2, int32: 2, uint32: 2, int16: 1, uint16: 1 };

/**
 * Carrega um perfil de registradores: o id de um perfil embutido
 * (pasta profiles/) ou o caminho de um arquivo JSON do instalador.
 */
export function loadProfile(ref, baseDir = process.cwd()) {
  const builtin = join(BUILTIN_DIR, `${ref}.json`);
  const path = existsSync(builtin)
    ? builtin
    : isAbsolute(ref)
      ? ref
      : resolve(baseDir, ref);
  if (!existsSync(path)) {
    throw new Error(`profile "${ref}" not found (built-in or file ${path})`);
  }
  let profile;
  try {
    profile = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`profile ${path} is not valid JSON: ${err.message}`);
  }
  validateProfile(profile, path);
  return profile;
}

export function validateProfile(p, where = "profile") {
  const fail = (msg) => {
    throw new Error(`${where}: ${msg}`);
  };
  if (!p || typeof p !== "object") fail("must be an object");
  if (!p.id) fail("missing id");
  if (!["holding", "input"].includes(p.function)) {
    fail('function must be "holding" or "input"');
  }
  if (!Array.isArray(p.blocks) || p.blocks.length === 0) fail("needs blocks");
  for (const b of p.blocks) {
    if (!Number.isInteger(b.address) || b.address < 0 || b.address > 65535) {
      fail(`block address ${b.address} out of range`);
    }
    if (!Number.isInteger(b.count) || b.count < 1 || b.count > 125) {
      fail(`block count ${b.count} must be 1-125 (Modbus limit)`);
    }
  }
  const covered = (addr) =>
    p.blocks.some((b) => addr >= b.address && addr < b.address + b.count);
  for (const [name, def] of Object.entries(p.values ?? {})) {
    if (!TYPES.has(def.type)) fail(`value ${name}: unknown type ${def.type}`);
    for (let i = 0; i < WIDTH[def.type]; i++) {
      if (!covered(def.address + i)) {
        fail(`value ${name}: register ${def.address + i} is outside every block`);
      }
    }
  }
  const map = p.map ?? {};
  if (!map.level || !p.values?.[map.level]) fail("map.level must name a value");
  const levelUnit = p.values[map.level].unit;
  if (!isLengthUnit(levelUnit)) fail(`level unit ${levelUnit} is not a length`);
  if (map.interface) {
    const u = p.values[map.interface]?.unit;
    if (!isLengthUnit(u)) fail(`interface unit ${u} is not a length`);
  }
  for (const key of Object.keys(map)) {
    if (!p.values?.[map[key]]) fail(`map.${key} names unknown value ${map[key]}`);
  }
  if (p.defaultWordOrder && !WORD_ORDERS.includes(p.defaultWordOrder)) {
    fail(`defaultWordOrder must be one of ${WORD_ORDERS.join(", ")}`);
  }
  if (p.wordOrderProbe && !p.values?.[p.wordOrderProbe.value]) {
    fail("wordOrderProbe.value names an unknown value");
  }
}
