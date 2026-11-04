import test from "node:test";
import assert from "node:assert/strict";

const { setUnitSystem } = await import("../src/i18n/units.ts");
const { formatFeetInches, formatGauge, reportVolume, reportUnits } = await import(
  "../src/utils/units.ts"
);

test("gauge readings round to the nearest quarter inch", () => {
  assert.equal(formatFeetInches(0), `0' 0"`);
  assert.equal(formatFeetInches(3.7719), `12' 4 1/2"`);
  assert.equal(formatFeetInches(0.0254 * 11.875), `1' 0"`);
  assert.equal(formatFeetInches(0.0254 * 30.75), `2' 6 3/4"`);
});

test("report cells follow the unit system", () => {
  setUnitSystem("imperial");
  assert.equal(formatGauge(3.7719), `12' 4 1/2"`);
  assert.equal(reportVolume(158.9873 * 120), "120.0");
  assert.deepEqual(reportUnits(), { level: "ft-in", volume: "bbl" });
  assert.equal(formatGauge(null), "—");

  setUnitSystem("metric");
  assert.equal(formatGauge(3.7719), "3.772");
  assert.equal(reportVolume(19078.5), "19.08");
  assert.deepEqual(reportUnits(), { level: "m", volume: "m³" });
  setUnitSystem("imperial");
});
