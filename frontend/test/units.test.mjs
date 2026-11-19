import test from "node:test";
import assert from "node:assert/strict";

// O store é DOM-free (localStorage ausente cai no padrão em memória)
const {
  setUnitSystem,
  getUnitSystem,
} = await import("../src/i18n/units.ts");
const {
  formatLevel,
  formatVolumeL,
  formatCapacityM3,
  formatRateMH,
  formatRateM3H,
  formatDimension,
  volumeValue,
} = await import("../src/utils/units.ts");

test("stats de volume convertem L para bbl sem fixar a unidade", () => {
  setUnitSystem("imperial");
  assert.ok(volumeValue(158.9873 * 2).startsWith("2"));
  setUnitSystem("metric");
  assert.ok(["1,590", "1.590"].includes(volumeValue(1589.873)));
  assert.equal(volumeValue(null), "—");
  setUnitSystem("imperial");
});

test("padrao e imperial (mercado US)", () => {
  assert.equal(getUnitSystem(), "imperial");
});

test("formatLevel converte m -> ft com NIST 0,3048", () => {
  setUnitSystem("imperial");
  // 0.9144 m = 3 ft exatos
  assert.ok(formatLevel(0.9144).startsWith("3"));
  assert.ok(formatLevel(0.9144).endsWith("ft"));
  setUnitSystem("metric");
  assert.ok(formatLevel(1.5).endsWith("m"));
  assert.ok(formatLevel(1.5).startsWith("1"));
});

test("volume: L -> bbl (1 bbl = 158,9873 L) e metrico preserva L (~m3)", () => {
  setUnitSystem("imperial");
  const bbl = formatVolumeL(158.9873);
  assert.ok(bbl.startsWith("1"), `esperado ~1 bbl, veio ${bbl}`);
  assert.ok(bbl.endsWith("bbl"));
  setUnitSystem("metric");
  const metric = formatVolumeL(1589.873);
  assert.ok(metric.includes("L"), `esperado litros, veio ${metric}`);
  assert.ok(metric.includes("m³"));
});

test("capacidade m3 -> bbl no imperial", () => {
  setUnitSystem("imperial");
  const bbl = formatCapacityM3(1); // 1000 L ≈ 6,29 bbl
  assert.ok(bbl.startsWith("6"), `esperado ~6.3 bbl, veio ${bbl}`);
  setUnitSystem("metric");
  assert.ok(formatCapacityM3(1).endsWith("m³"));
});

test("ritmos de nivel e volume com sinal", () => {
  setUnitSystem("imperial");
  // 1 m/h ≈ 3,28 ft/h ; 1 m³/h ≈ 6,3 bbl/h (1 casa decimal)
  assert.ok(formatRateMH(1).includes("3.28") || formatRateMH(1).includes("3,28"));
  assert.ok(formatRateMH(-1).startsWith("−"));
  assert.ok(formatRateM3H(1).includes("6.3") || formatRateM3H(1).includes("6,3"));
  setUnitSystem("metric");
  assert.ok(formatRateMH(1).endsWith("m/h"));
  assert.ok(formatRateM3H(1).endsWith("m³/h"));
});

test("dimensoes com 1 casa decimal", () => {
  setUnitSystem("imperial");
  assert.ok(formatDimension(0.9144).startsWith("3"));
  setUnitSystem("metric");
  assert.ok(formatDimension(3.2).endsWith("m"));
});
