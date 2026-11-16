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
