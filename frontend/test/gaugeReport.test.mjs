import test from "node:test";
import assert from "node:assert/strict";

const { setUnitSystem } = await import("../src/i18n/units.ts");
const { isLatestRequest } = await import("../src/utils/request.ts");
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

test("only the latest gauge request can update report, error and loading", () => {
  let latestRequestId = 0;
  const state = { report: null, error: null, loading: false };
  const begin = () => {
    latestRequestId += 1;
    state.loading = true;
    state.error = null;
    return latestRequestId;
  };
  const succeed = (id, report) => {
    if (!isLatestRequest(id, latestRequestId)) return;
    state.report = report;
    state.loading = false;
  };
  const fail = (id, error) => {
    if (!isLatestRequest(id, latestRequestId)) return;
    state.error = error;
    state.loading = false;
  };

  const oldRequest = begin();
  const currentRequest = begin();
  succeed(currentRequest, "current");
  fail(oldRequest, "stale error");
  assert.deepEqual(state, { report: "current", error: null, loading: false });

  const oldSuccess = begin();
  const currentFailure = begin();
  fail(currentFailure, "current error");
  succeed(oldSuccess, "stale report");
  assert.deepEqual(state, {
    report: "current",
    error: "current error",
    loading: false,
  });
});
