import assert from "node:assert/strict";
import { test } from "node:test";
import { withTelemetryGaps } from "../src/utils/telemetry.ts";
import { formatBarrels, formatFeet } from "../src/utils/format.ts";
import { setLanguage } from "../src/i18n/language.ts";

// Os testes de unidade fixam pt-BR para os asserts de formatação;
// a base da UI continua sendo inglês (definida em src/i18n/index.ts).
setLanguage("pt-BR");

test("continuous telemetry is preserved without separators or mutation", () => {
  const points = [
    { t: 0, avg: 1 },
    { t: 1000, avg: 2 },
  ];
  assert.deepEqual(withTelemetryGaps(points, 1000), points);
  assert.equal(points.length, 2);
});

test("missing telemetry becomes a visible break rather than an interpolated level", () => {
  const result = withTelemetryGaps(
    [
      { t: 0, avg: 1 },
      { t: 5000, avg: 2 },
    ],
    1000,
  );
  assert.deepEqual(result, [
    { t: 0, avg: 1 },
    { t: 1000 },
    { t: 5000, avg: 2 },
  ]);
});

test("empty telemetry remains empty", () =>
  assert.deepEqual(withTelemetryGaps([], 1000), []));

test("display decimation does not invent missing telemetry", () => {
  const original = Array.from({ length: 6 }, (_, index) => ({
    t: index * 1000,
    avg: index,
  }));
  const sampled = [original[0], original[5]];
  assert.deepEqual(withTelemetryGaps(sampled, 1000, original), sampled);
});

test("invalid sampling intervals are rejected", () => {
  for (const interval of [0, -1, NaN, Infinity])
    assert.throws(() => withTelemetryGaps([], interval), RangeError);
});

test("one international foot is shown from 0.3048 meters", () =>
  assert.equal(formatFeet(0.3048), "1,00 ft"));
test("petroleum barrels use the NIST volume factor", () =>
  assert.equal(formatBarrels(158.9873), "1 bbl"));
test("one cubic meter is approximately 6.3 petroleum barrels", () =>
  assert.equal(formatBarrels(1000), "6,3 bbl"));
test("zero levels and volumes are distinct from missing data", () => {
  assert.equal(formatFeet(0), "0,00 ft");
  assert.equal(formatBarrels(0), "0 bbl");
  assert.equal(formatFeet(null), "—");
  assert.equal(formatBarrels(undefined), "—");
});
test("nonfinite measurements cannot become displayed unit values", () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(formatFeet(value), "—");
    assert.equal(formatBarrels(value), "—");
  }
});
test("unit formatting follows the active UI language", () => {
  setLanguage("en");
  assert.equal(formatFeet(0.3048), "1.00 ft");
  assert.equal(formatBarrels(1000), "6.3 bbl");
  setLanguage("es");
  assert.equal(formatFeet(0.3048), "1,00 ft");
  setLanguage("pt-BR");
  assert.equal(formatBarrels(1000), "6,3 bbl");
});
