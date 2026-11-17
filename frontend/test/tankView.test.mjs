import assert from "node:assert/strict";
import { test } from "node:test";
import { buildTankView, sortTankViews } from "../src/utils/tankView.ts";

const tank = {
  id: "tank-1",
  code: "FK-01",
  name: "Flowback 01",
  status: "active",
  dimensions: { height: 6, diameter: 3, volume: 42000 },
  maxLevelThreshold: 5,
};

const sensorId = "6f55628f-0770-4b1f-b77c-5b368f0db3d1";
const otherSensorId = "b9684342-b74f-4f5f-a711-641ec1e2f15c";

function state(overrides = {}) {
  return {
    tankId: tank.id,
    tankStatus: "active",
    sensorId,
    sensorType: "magnetostrictive",
    level: 3,
    oilWaterInterface: null,
    readingTimestamp: "2026-11-16T11:59:00Z",
    readingFreshness: { fresh: true, ageSeconds: 60, maxAgeSeconds: 300 },
    heartbeat: {
      timestamp: "2026-11-16T11:59:30Z",
      fresh: true,
      ageSeconds: 30,
      maxAgeSeconds: 300,
    },
    criticalAlarmOpen: false,
    forecastError: false,
    forecast: null,
    ...overrides,
  };
}

function forecast(overrides = {}) {
  return {
    tankId: tank.id,
    tankCode: tank.code,
    tankName: tank.name,
    sensorId,
    currentLevel: 9.99,
    lastReadingAt: "2026-11-16T11:59:00Z",
    dataFresh: true,
    fillRateMH: 0.5,
    fillRateM3H: 1,
    trend: "rising",
    confidence: 0.9,
    etaMaxLevelHours: 4,
    etaOverflowHours: 2,
    etaMinLevelHours: null,
    thresholds: {
      maxLevel: 5,
      overflow: 5.5,
      minLevel: null,
      lowLevel: null,
    },
    predictedAt: "2026-11-16T12:00:00Z",
    ...overrides,
  };
}

test("only a fresh reading makes an active tank green", () => {
  assert.equal(buildTankView(tank, state()).markerColor, "green");
  assert.equal(
    buildTankView(
      tank,
      state({
        readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
      }),
    ).markerColor,
    "slate",
  );
});

test("a fresh heartbeat never refreshes an old reading", () => {
  const view = buildTankView(
    tank,
    state({
      level: 4.25,
      readingFreshness: { fresh: false, ageSeconds: 900, maxAgeSeconds: 300 },
      forecast: forecast(),
    }),
  );

  assert.equal(view.communicationFailed, false);
  assert.equal(view.readingFresh, false);
  assert.equal(view.level, 4.25);
  assert.equal(view.markerColor, "slate");
  assert.equal(view.forecast, undefined);
});

test("stale level and interface remain visible without a usable forecast", () => {
  const oilWaterInterface = { oilLevel: 1.2, waterLevel: 0.8, interfaceLevel: 0.8 };
  const view = buildTankView(
    tank,
    state({
      level: 2,
      oilWaterInterface,
      readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
      forecast: forecast(),
    }),
  );

  assert.equal(view.level, 2);
  assert.deepEqual(view.oilWaterInterface, oilWaterInterface);
  assert.equal(view.readingTimestamp, "2026-11-16T11:59:00Z");
  assert.equal(view.forecastAvailable, false);
  assert.equal(view.etaOverflowHours, null);
});

test("a fresh level above max is orange and at risk without a forecast", () => {
  const view = buildTankView(tank, state({ level: 5 }));

  assert.equal(view.aboveOperationalLimit, true);
  assert.equal(view.atRisk, true);
  assert.equal(view.markerColor, "orange");
});

test("a stale level above max is neutral and not at risk", () => {
  const view = buildTankView(
    tank,
    state({
      level: 5.5,
      readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
    }),
  );

  assert.equal(view.aboveOperationalLimit, false);
  assert.equal(view.atRisk, false);
  assert.equal(view.markerColor, "slate");
});

test("an open critical alarm is red and at risk even when telemetry is stale", () => {
  const view = buildTankView(
    tank,
    state({
      criticalAlarmOpen: true,
      readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
      heartbeat: { timestamp: null, fresh: false, ageSeconds: null, maxAgeSeconds: 300 },
    }),
  );

  assert.equal(view.criticalAlarmOpen, true);
  assert.equal(view.atRisk, true);
  assert.equal(view.markerColor, "red");
});

test("a near ETA is amber and at risk only when reading and forecast are fresh", () => {
  const fresh = buildTankView(tank, state({ forecast: forecast() }));
  assert.equal(fresh.level, 3);
  assert.equal(fresh.etaOverflowHours, 2);
  assert.equal(fresh.critical, true);
  assert.equal(fresh.atRisk, true);
  assert.equal(fresh.markerColor, "amber");

  const stale = buildTankView(
    tank,
    state({
      readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
      forecast: forecast(),
    }),
  );
  assert.equal(stale.forecast, undefined);
  assert.equal(stale.etaOverflowHours, null);
  assert.equal(stale.atRisk, false);
  assert.equal(stale.markerColor, "slate");
});

test("a stale forecast is not usable even when the reading is fresh", () => {
  const view = buildTankView(
    tank,
    state({ forecast: forecast({ dataFresh: false }) }),
  );

  assert.equal(view.forecastAvailable, false);
  assert.equal(view.etaOverflowHours, null);
});

test("a forecast from another reading is rejected", () => {
  const view = buildTankView(
    tank,
    state({
      forecast: forecast({ lastReadingAt: "2026-11-16T11:58:00Z" }),
    }),
  );

  assert.equal(view.readingTimestamp, "2026-11-16T11:59:00Z");
  assert.equal(view.forecast, undefined);
  assert.equal(view.forecastAvailable, false);
  assert.equal(view.etaOverflowHours, null);
  assert.equal(view.atRisk, false);
});

test("a forecast attached to a forecast error is not used", () => {
  const view = buildTankView(
    tank,
    state({ forecastError: true, forecast: forecast() }),
  );

  assert.equal(view.level, 3);
  assert.equal(view.forecast, undefined);
  assert.equal(view.etaOverflowHours, null);
});

test("a forecast from another sensor is rejected", () => {
  const view = buildTankView(
    tank,
    state({ forecast: forecast({ sensorId: otherSensorId }) }),
  );

  assert.equal(view.sensorId, sensorId);
  assert.equal(view.forecast, undefined);
  assert.equal(view.level, 3);
});

test("a failed heartbeat makes fresh telemetry neutral and communication unavailable", () => {
  const view = buildTankView(
    tank,
    state({
      heartbeat: {
        timestamp: "2026-11-16T11:50:00Z",
        fresh: false,
        ageSeconds: 600,
        maxAgeSeconds: 300,
      },
    }),
  );

  assert.equal(view.communicationFailed, true);
  assert.equal(view.readingFresh, true);
  assert.equal(view.markerColor, "slate");
});

test("maintenance remains amber without a sensor or heartbeat", () => {
  const view = buildTankView(
    tank,
    state({
      tankStatus: "maintenance",
      sensorId: null,
      sensorType: null,
      level: null,
      readingTimestamp: null,
      readingFreshness: { fresh: false, ageSeconds: null, maxAgeSeconds: 300 },
      heartbeat: {
        timestamp: null,
        fresh: false,
        ageSeconds: null,
        maxAgeSeconds: 300,
      },
    }),
  );

  assert.equal(view.tankStatus, "maintenance");
  assert.equal(view.communicationFailed, false);
  assert.equal(view.level, null);
  assert.equal(view.markerColor, "amber");
});

test("maintenance remains visible with a stale reading", () => {
  const oilWaterInterface = { oilLevel: 1, waterLevel: 0.5, interfaceLevel: 0.5 };
  const view = buildTankView(
    tank,
    state({
      tankStatus: "maintenance",
      level: 1.5,
      oilWaterInterface,
      readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 },
      heartbeat: {
        timestamp: "2026-11-16T11:50:00Z",
        fresh: false,
        ageSeconds: 600,
        maxAgeSeconds: 300,
      },
      forecast: forecast(),
    }),
  );

  assert.equal(view.tankStatus, "maintenance");
  assert.equal(view.communicationFailed, false);
  assert.equal(view.readingFresh, false);
  assert.equal(view.level, 1.5);
  assert.deepEqual(view.oilWaterInterface, oilWaterInterface);
  assert.equal(view.forecast, undefined);
  assert.equal(view.markerColor, "amber");
});

test("critical alarms and fresh operational limits outrank maintenance", () => {
  const alarm = buildTankView(
    tank,
    state({ tankStatus: "maintenance", criticalAlarmOpen: true }),
  );
  const above = buildTankView(
    tank,
    state({ tankStatus: "maintenance", level: 5 }),
  );

  assert.equal(alarm.markerColor, "red");
  assert.equal(alarm.atRisk, true);
  assert.equal(above.markerColor, "orange");
  assert.equal(above.atRisk, true);
});

test("missing operational state has no reading, sensor or forecast and is neutral", () => {
  const view = buildTankView(tank, undefined);

  assert.equal(view.sensorId, null);
  assert.equal(view.level, null);
  assert.equal(view.oilWaterInterface, null);
  assert.equal(view.readingTimestamp, null);
  assert.equal(view.readingFresh, false);
  assert.equal(view.communicationFailed, true);
  assert.equal(view.forecast, undefined);
  assert.equal(view.atRisk, false);
  assert.equal(view.markerColor, "slate");
});

test("zero is a valid level and interface value while null is absent", () => {
  const zero = buildTankView(
    tank,
    state({
      level: 0,
      oilWaterInterface: { oilLevel: 0, waterLevel: 0, interfaceLevel: 0 },
    }),
  );
  assert.equal(zero.level, 0);
  assert.equal(zero.oilWaterInterface.oilLevel, 0);
  assert.equal(zero.oilWaterInterface.waterLevel, 0);
  assert.equal(zero.oilWaterInterface.interfaceLevel, 0);
  assert.equal(zero.markerColor, "green");

  const absent = buildTankView(tank, state({ level: null, oilWaterInterface: null }));
  assert.equal(absent.level, null);
  assert.equal(absent.oilWaterInterface, null);
  assert.equal(absent.markerColor, "slate");
});

test("sorting follows marker severity, risk and fresh ETA", () => {
  const healthy = buildTankView({ ...tank, code: "A-green" }, state());
  const maintenance = buildTankView(
    { ...tank, code: "B-maintenance" },
    state({ tankStatus: "maintenance" }),
  );
  const stale = buildTankView(
    { ...tank, code: "C-stale" },
    state({ readingFreshness: { fresh: false, ageSeconds: 600, maxAgeSeconds: 300 } }),
  );
  const eta = buildTankView(
    { ...tank, code: "D-eta" },
    state({ forecast: forecast() }),
  );
  const above = buildTankView({ ...tank, code: "E-above" }, state({ level: 5 }));
  const alarm = buildTankView(
    { ...tank, code: "F-alarm" },
    state({ criticalAlarmOpen: true }),
  );

  const sorted = [healthy, stale, maintenance, eta, above, alarm].sort(sortTankViews);
  assert.deepEqual(
    sorted.map((view) => view.tank.code),
    ["F-alarm", "E-above", "D-eta", "B-maintenance", "C-stale", "A-green"],
  );
});
