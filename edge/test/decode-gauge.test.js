import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeFloat32, decodeInt16, detectWordOrder, WORD_ORDERS } from "../src/decode.js";
import { loadProfile } from "../src/profiles.js";
import { GaugeState, interpret, decide } from "../src/gauge.js";
import { encodeFloat32, floatStickRegisters } from "./helpers.js";

const profile = loadProfile("signalfire-sentinel-float-stick");
const gauge = { sensorId: "FS-24117", unitId: 11, floats: 2, wordOrder: "auto", battery: null };
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);

test("float32 decodes in every word order", () => {
  for (const order of WORD_ORDERS) {
    const [r0, r1] = encodeFloat32(-12.5, order);
    assert.equal(decodeFloat32(r0, r1, order), -12.5);
  }
  assert.deepEqual(encodeFloat32(240, "ABCD"), [0x4370, 0x0000]);
  assert.equal(decodeInt16(0xffb9), -71);
});

test("word order is detected from the stick span", () => {
  const def = profile.values.span;
  assert.equal(detectWordOrder(floatStickRegisters({ order: "ABCD" }), def, 6, 1200), "ABCD");
  assert.equal(detectWordOrder(floatStickRegisters({ order: "CDAB" }), def, 6, 1200), "CDAB");
  assert.equal(detectWordOrder(floatStickRegisters({ order: "CDAB", span: 120.25 }), def, 6, 1200), "CDAB");
});

test("a dual-float reading becomes level + oil/water layers in meters", () => {
  const state = new GaugeState(gauge, profile);
  const r = interpret(state, floatStickRegisters({ product: 120, iface: 84, order: "CDAB" }));
  assert.equal(r.status, "ok");
  assert.equal(state.wordOrder, "CDAB");
  close(r.sample.level, 3.048);
  close(r.sample.oilWaterInterface.waterLevel, 2.1336);
  close(r.sample.oilWaterInterface.oilLevel, 0.9144);
  assert.equal(r.sample.oilWaterInterface.interfaceLevel, r.sample.oilWaterInterface.waterLevel);
  // a soma bate com a regra da API (tolerância 1 mm)
  const { oilLevel, waterLevel } = r.sample.oilWaterInterface;
  assert.ok(Math.abs(oilLevel + waterLevel - r.sample.level) <= 0.001);
  assert.equal(r.sample.metadata.temperature, 18.5);
  assert.equal(r.sample.metadata.signalStrength, -71);
  assert.equal(r.sample.metadata.rawData.batteryMv, 3590);
  assert.equal(r.sample.batteryLevel, undefined); // sem curva configurada, não inventa %
});

test("single-float sticks send level only; battery % only with a configured range", () => {
  const state = new GaugeState({ ...gauge, floats: 1, battery: { emptyMv: 3000, fullMv: 3600 } }, profile);
  const r = interpret(state, floatStickRegisters({ iface: 0 }));
  assert.equal(r.status, "ok");
  assert.equal(r.sample.oilWaterInterface, undefined);
  close(r.sample.batteryLevel, 98.3, 0.05);
});

test("interface float noise above the product float is clamped to the level", () => {
  const state = new GaugeState(gauge, profile);
  const r = interpret(state, floatStickRegisters({ product: 50, iface: 50.02 }));
  assert.equal(r.sample.oilWaterInterface.oilLevel, 0);
  assert.equal(r.sample.oilWaterInterface.waterLevel, r.sample.level);
});

test("the manual's error value and status codes stop the reading", () => {
  const state = new GaugeState(gauge, profile);
  const r = interpret(state, floatStickRegisters({ product: 999.9999, iface: 999.9999, temp: 999.9999, comm: 1 }));
  assert.equal(r.status, "sensorError");
  assert.match(r.detail, /no data received/);
  const r4 = interpret(state, floatStickRegisters({ comm: 4 }));
  assert.match(r4.detail, /internal error/);
});

test("a node the gateway timed out is stale, a wrong Slave ID is rejected", () => {
  const state = new GaugeState(gauge, profile);
  assert.equal(interpret(state, floatStickRegisters({ minutes: 0 })).status, "stale");
  const wrong = interpret(new GaugeState(gauge, profile), floatStickRegisters({ deviceType: 51 }));
  assert.equal(wrong.status, "wrongDevice");
  assert.match(wrong.detail, /Slave ID \(11\)/);
  const wrongUnit = interpret(new GaugeState(gauge, profile), floatStickRegisters({ unitId: 12 }));
  assert.equal(wrongUnit.status, "wrongDevice");
  assert.match(wrongUnit.detail, /slaveIdReadback is 12, expected 11/);
});

test("SignalFire rejects a missing optional status block and each required value", () => {
  const withoutBlock = interpret(new GaugeState(gauge, profile), floatStickRegisters({ status: false }));
  assert.equal(withoutBlock.status, "sensorError");
  assert.match(withoutBlock.detail, /slaveIdReadback/);

  const required = [
    ["commStatus", [1016, 1017]],
    ["slaveIdReadback", [9993]],
    ["minutesToTimeout", [9996]],
    ["deviceType", [9998]],
  ];
  for (const [name, addresses] of required) {
    const registers = floatStickRegisters();
    addresses.forEach((address) => registers.delete(address));
    const result = interpret(new GaugeState(gauge, profile), registers);
    assert.equal(result.status, "sensorError");
    assert.match(result.detail, new RegExp(name));
  }
});

test("a dual-float gauge rejects a missing, non-finite or negative interface", () => {
  const missing = floatStickRegisters();
  missing.delete(1004);
  missing.delete(1005);
  for (const registers of [missing, floatStickRegisters({ iface: Number.NaN }), floatStickRegisters({ iface: -1 })]) {
    const result = interpret(new GaugeState(gauge, profile), registers);
    assert.equal(result.status, "sensorError");
    assert.equal(result.sample, undefined);
  }
});

test("a generic profile without required values remains permissive", () => {
  const generic = { ...profile, requiredValues: [], expect: {} };
  const result = interpret(new GaugeState(gauge, generic), floatStickRegisters({ status: false }));
  assert.equal(result.status, "ok");
  assert.equal(result.minutesToTimeout, undefined);
  assert.equal(result.sample.metadata.signalStrength, undefined);
});

test("an unreadable word order asks the installer to set it", () => {
  const state = new GaugeState(gauge, profile);
  const r = interpret(state, floatStickRegisters({ span: 0 }));
  assert.equal(r.status, "wordOrderUnknown");
});

test("buffered gateway: a repeated check-in is sent once, then heartbeats", () => {
  const opts = { heartbeatSeconds: 60, forceReadingSeconds: 600 };
  const state = new GaugeState(gauge, profile);
  const at = (min) => min * 60_000;
  const step = (regs, t) => {
    const r = interpret(state, regs);
    const action = decide(state, r, t, opts);
    if (action === "reading") state.lastReadingSentAt = t;
    if (action === "heartbeat") state.lastHeartbeatAt = t;
    return action;
  };
  assert.equal(step(floatStickRegisters({ minutes: 9 }), at(0)), "reading");
  // mesmo dado no buffer, contador caindo: só heartbeat
  assert.equal(step(floatStickRegisters({ minutes: 8 }), at(1)), "heartbeat");
  assert.equal(step(floatStickRegisters({ minutes: 8 }), at(1.5)), "none");
  // check-in novo com o mesmo nível (tanque parado): contador reinicia
  assert.equal(step(floatStickRegisters({ minutes: 9 }), at(3)), "reading");
  // nível mudou
  assert.equal(step(floatStickRegisters({ minutes: 8, product: 121 }), at(4)), "reading");
  // mesmo check-in e nada mudou: leitura forçada a cada 10 min
  assert.equal(step(floatStickRegisters({ minutes: 7, product: 121 }), at(5)), "heartbeat");
  assert.equal(step(floatStickRegisters({ minutes: 7, product: 121 }), at(14.5)), "reading");
});
