import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_TANK_FORM,
  M_PER_FT,
  L_PER_BBL,
  parseLength,
  parseNumber,
  parseStrappingTable,
  tankToFormValues,
  validateTankForm,
} from "../src/utils/tankForm.ts";

const close = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("numbers accept comma or dot decimals", () => {
  assert.equal(parseNumber("1,5"), 1.5);
  assert.equal(parseNumber(" 2.25 "), 2.25);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("imperial lengths accept decimal feet and feet-inches", () => {
  close(parseLength("20", "imperial"), 20 * M_PER_FT);
  close(parseLength("20'6\"", "imperial"), 20.5 * M_PER_FT);
  close(parseLength("20' 6", "imperial"), 20.5 * M_PER_FT);
  close(parseLength("20 ft 3 in", "imperial"), 20.25 * M_PER_FT);
  assert.equal(parseLength("20'13\"", "imperial"), null);
  assert.equal(parseLength("6.1", "metric"), 6.1);
});

test("strapping table: ft/bbl lines become m/L, header and blanks skipped", () => {
  const text = "Level\tBbl\n0\t0\n\n1'0\"\t20.03\n2;40,06\n# comment\n3 60.09";
  const { rows, errorLine } = parseStrappingTable(text, "imperial");
  assert.equal(errorLine, null);
  assert.equal(rows.length, 4);
  close(rows[1].level, M_PER_FT, 1e-4);
  close(rows[1].volume, 20.03 * L_PER_BBL, 1e-3);
  close(rows[2].volume, 40.06 * L_PER_BBL, 1e-3);
});

test("strapping table reports the first unreadable line", () => {
  const { errorLine } = parseStrappingTable("0 0\n1 x\n2 40", "metric");
  assert.equal(errorLine, 2);
});

test("a 400 bbl production tank in ft converts to a metric payload", () => {
  const { errors, payload } = validateTankForm(
    {
      ...EMPTY_TANK_FORM,
      code: "PT-01",
      name: "Production tank 1",
      height: "20",
      diameter: "12",
      latitude: "48.15",
      longitude: "-103.62",
      overflow: "18'6\"",
      high: "17",
      low: "2",
      min: "1",
    },
    "imperial",
  );
  assert.deepEqual(errors, {});
  close(payload.dimensions.height, 6.096, 1e-4);
  close(payload.dimensions.diameter, 3.6576, 1e-4);
  assert.equal(payload.overflowThreshold, 5.64);
  assert.equal(payload.maxLevelThreshold, 5.18);
  assert.equal(payload.arqueacaoTable, null);
  assert.equal(payload.status, "active");
});

test("required fields, out-of-order limits and limits above height are flagged", () => {
  const empty = validateTankForm(EMPTY_TANK_FORM, "metric");
  assert.equal(empty.payload, null);
  assert.equal(empty.errors.code.key, "tankForm.errRequired");
  assert.equal(empty.errors.height.key, "tankForm.errRequired");

  const base = {
    ...EMPTY_TANK_FORM,
    code: "T",
    name: "T",
    height: "5",
    diameter: "3",
    latitude: "0",
    longitude: "0",
  };
  const order = validateTankForm({ ...base, high: "4.6", overflow: "4.2" }, "metric");
  assert.equal(order.errors.overflow.key, "tankForm.errOrder");
  const equalLowHigh = validateTankForm({ ...base, low: "2", high: "2" }, "metric");
  assert.equal(equalLowHigh.errors.high.key, "tankForm.errOrder");
  const above = validateTankForm({ ...base, overflow: "6" }, "metric");
  assert.equal(above.errors.overflow.key, "tankForm.errAboveHeight");
  const table = validateTankForm({ ...base, strapping: "0 0\n2 100\n1 200" }, "metric");
  assert.equal(table.errors.strapping.key, "tankForm.errStrappingOrder");
});

test("an existing tank round-trips through the form in imperial units", () => {
  const tank = {
    code: "FK-01",
    name: "Flowback Tank 01",
    dimensions: { height: 5, diameter: 3.2 },
    arqueacaoTable: [
      { level: 0, volume: 0 },
      { level: 5, volume: 40212 },
    ],
    latitude: -5.1875,
    longitude: -37.0721,
    overflowThreshold: 4.6,
    maxLevelThreshold: 4.2,
    lowLevelThreshold: 0.5,
    minLevelThreshold: 0.3,
    status: "active",
  };
  const values = tankToFormValues(tank, "imperial");
  const { errors, payload } = validateTankForm(values, "imperial");
  assert.deepEqual(errors, {});
  close(payload.dimensions.height, 5, 1e-3);
  assert.equal(payload.overflowThreshold, 4.6);
  close(payload.arqueacaoTable[1].volume, 40212, 1);
});
