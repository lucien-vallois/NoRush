import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTankView } from "../src/utils/tankView.ts";

const tank = {
  id: "tank-1",
  code: "FK-01",
  name: "Flowback 01",
  status: "active",
  dimensions: { height: 6, diameter: 3, volume: 42000 },
  maxLevelThreshold: 5,
};

test("a valid latest reading remains visible when the forecast is unavailable", () => {
  const view = buildTankView(tank, 3.75, {
    currentLevel: 9.99,
    dataFresh: false,
    etaOverflowHours: 1,
  });

  assert.equal(view.level, 3.75);
  assert.equal(view.forecast, undefined);
  assert.equal(view.forecastAvailable, false);
  assert.equal(view.etaOverflowHours, null);
});

test("the current level never comes from the forecast", () => {
  const view = buildTankView(tank, 3.75, {
    currentLevel: 9.99,
    dataFresh: true,
    etaOverflowHours: null,
  });

  assert.equal(view.level, 3.75);
  assert.equal(view.forecastAvailable, true);
});

const now = Date.parse("2026-11-16T12:00:00Z");
const onlineTank = {
  ...tank,
  sensors: [
    {
      status: "active",
      lastTransmissionAt: new Date(now - 60_000),
    },
  ],
};
const nearOverflow = { dataFresh: true, etaOverflowHours: 2 };

test("an open critical alarm takes precedence over every other condition", () => {
  const view = buildTankView(onlineTank, 5.5, nearOverflow, {
    criticalAlarmOpen: true,
    now,
  });

  assert.equal(view.markerColor, "red");
});

test("a tank above its operational limit is orange even without a forecast", () => {
  const view = buildTankView(onlineTank, 5, undefined, { now });

  assert.equal(view.aboveOperationalLimit, true);
  assert.equal(view.markerColor, "orange");
  assert.notEqual(view.markerColor, "green");
});

test("the current level takes precedence over a failed heartbeat", () => {
  const view = buildTankView(tank, 5.5, nearOverflow, { now });

  assert.equal(view.communicationFailed, true);
  assert.equal(view.markerColor, "orange");
});

test("failed communication takes precedence over the overflow ETA", () => {
  const view = buildTankView(tank, 3, nearOverflow, { now });

  assert.equal(view.communicationFailed, true);
  assert.equal(view.markerColor, "slate");
});

test("a near overflow ETA is yellow when the current state is normal", () => {
  const view = buildTankView(onlineTank, 3, nearOverflow, { now });

  assert.equal(view.markerColor, "amber");
});

test("a tank with current telemetry and no nearer risk is green", () => {
  const view = buildTankView(onlineTank, 3, undefined, { now });

  assert.equal(view.markerColor, "green");
});
