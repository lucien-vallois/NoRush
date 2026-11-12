import {
  buildTankFigures,
  deadbandLiters,
  detectRemovals,
  formatFeetInches,
  gaugeAt,
  GaugeSample,
  lastCompletedDate,
  makeVolumeFn,
  medianFilter,
  periodBounds,
} from './gauge-report.engine';

const iso = (ms: number) => new Date(ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

/** Deterministic Gaussian noise (mulberry32 + Box-Muller). */
function noise(seed: number, sigma: number) {
  let a = seed;
  const uniform = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () =>
    sigma *
    Math.sqrt(-2 * Math.log(uniform() || 1e-12)) *
    Math.cos(2 * Math.PI * uniform());
}

describe('formatFeetInches', () => {
  it('reads like a hand gauge, to the nearest quarter inch', () => {
    expect(formatFeetInches(0)).toBe(`0' 0"`);
    expect(formatFeetInches(0.3048)).toBe(`1' 0"`);
    expect(formatFeetInches(3.7719)).toBe(`12' 4 1/2"`);
    expect(formatFeetInches(0.0254 * 11.875)).toBe(`1' 0"`);
    expect(formatFeetInches(0.0254 * 30.25)).toBe(`2' 6 1/4"`);
  });
});

describe('makeVolumeFn', () => {
  it('uses a vertical cylinder without a strapping table', () => {
    const v = makeVolumeFn({ height: 5, diameter: 3.2 });
    expect(v(1)).toBeCloseTo(Math.PI * 1.6 * 1.6 * 1000, 3);
    expect(v(-1)).toBe(0);
  });

  it('interpolates the strapping table and clamps outside it', () => {
    const v = makeVolumeFn({ height: 6, diameter: 3 }, [
      { level: 2, volume: 2000 },
      { level: 0, volume: 0 },
      { level: 4, volume: 5000 },
    ]);
    expect(v(1)).toBe(1000);
    expect(v(3)).toBe(3500);
    expect(v(5)).toBe(5000);
  });

  it('turns 2 inches of level into liters at the average cross-section', () => {
    const v = makeVolumeFn({ height: 5, diameter: 3.2 });
    expect(deadbandLiters(v, 5)).toBeCloseTo(
      Math.PI * 1.6 * 1.6 * 1000 * 0.0508,
      3,
    );
  });
});

describe('periodBounds', () => {
  const tz = 'America/Chicago';

  it('runs a gauge day from 7:00 to 7:00 on the pad clock', () => {
    const p = periodBounds('daily', '2026-11-03', 7, tz);
    expect(iso(p.start)).toBe('2026-11-03T13:00:00.000Z');
    expect(iso(p.end)).toBe('2026-11-04T13:00:00.000Z');
  });

  it('splits the gauge day into day and night shifts', () => {
    const day = periodBounds('day', '2026-11-03', 7, tz);
    const night = periodBounds('night', '2026-11-03', 7, tz);
    expect(iso(day.start)).toBe('2026-11-03T13:00:00.000Z');
    expect(iso(day.end)).toBe('2026-11-04T01:00:00.000Z');
    expect(night.start).toBe(day.end);
    expect(iso(night.end)).toBe('2026-11-04T13:00:00.000Z');
  });

  it('gives a 25-hour gauge day when clocks fall back and 23 when they spring forward', () => {
    const fall = periodBounds('daily', '2026-10-31', 7, tz);
    expect((fall.end - fall.start) / HOUR).toBe(25);
    const spring = periodBounds('daily', '2026-03-07', 7, tz);
    expect((spring.end - spring.start) / HOUR).toBe(23);
  });

  it('handles a gauge day that starts in the evening', () => {
    const night = periodBounds('night', '2026-11-03', 18, 'UTC');
    expect(iso(night.start)).toBe('2026-11-04T06:00:00.000Z');
    expect(iso(night.end)).toBe('2026-11-04T18:00:00.000Z');
  });

  it('rejects impossible dates', () => {
    expect(() => periodBounds('daily', '2026-02-30', 7, tz)).toThrow();
  });
});

describe('lastCompletedDate', () => {
  it('picks the most recent period that has ended', () => {
    const now = Date.parse('2026-11-04T15:00:00Z'); // 09:00 in Chicago
    expect(lastCompletedDate('daily', now, 7, 'America/Chicago')).toBe(
      '2026-11-03',
    );
    expect(lastCompletedDate('night', now, 7, 'America/Chicago')).toBe(
      '2026-11-03',
    );
    expect(lastCompletedDate('day', now, 7, 'America/Chicago')).toBe(
      '2026-11-03',
    );
    const evening = Date.parse('2026-11-05T02:00:00Z'); // 20:00 on Nov 4
    expect(lastCompletedDate('day', evening, 7, 'America/Chicago')).toBe(
      '2026-11-04',
    );
  });
});

describe('medianFilter and gaugeAt', () => {
  it('removes a single spike', () => {
    expect(medianFilter([1, 1, 9, 1, 1])).toEqual([1, 1, 1, 1, 1]);
  });

  it('uses the median near the boundary, else the nearest reading within 30 minutes', () => {
    const at = Date.parse('2026-11-03T13:00:00Z');
    const close: GaugeSample[] = [
      { t: at - 5 * MIN, level: 2.0, interfaceLevel: 1.0 },
      { t: at, level: 2.2, interfaceLevel: 1.1 },
      { t: at + 5 * MIN, level: 2.1, interfaceLevel: 1.2 },
    ];
    expect(gaugeAt(close, at)).toEqual({ at, level: 2.1, interfaceLevel: 1.1 });
    const far: GaugeSample[] = [
      { t: at + 25 * MIN, level: 3, interfaceLevel: null },
    ];
    expect(gaugeAt(far, at)).toEqual({
      at: at + 25 * MIN,
      level: 3,
      interfaceLevel: null,
    });
    expect(
      gaugeAt([{ t: at + 45 * MIN, level: 3, interfaceLevel: null }], at),
    ).toBeNull();
  });
});

describe('detectRemovals', () => {
  it('ignores noise smaller than the deadband and finds a haul', () => {
    const flat = Array.from({ length: 50 }, (_, i) => ({
      t: i * MIN,
      v: 1000 + (i % 2 ? 20 : -20),
    }));
    expect(detectRemovals(flat, 100)).toEqual([]);
    const haul = [
      ...Array.from({ length: 10 }, (_, i) => ({ t: i * MIN, v: 5000 + i })),
      ...Array.from({ length: 6 }, (_, i) => ({
        t: (10 + i) * MIN,
        v: 5009 - (i + 1) * 500,
      })),
      ...Array.from({ length: 10 }, (_, i) => ({
        t: (16 + i) * MIN,
        v: 2009 + i * 30,
      })),
    ];
    const events = detectRemovals(haul, 100);
    expect(events).toHaveLength(1);
    expect(events[0].amountL).toBe(3000);
    expect(events[0].start).toBe(9 * MIN);
    expect(events[0].end).toBe(15 * MIN);
  });
});

describe('buildTankFigures', () => {
  const tank = { height: 6, diameter: 3.2 };
  const volume = makeVolumeFn(tank);
  const area = Math.PI * 1.6 * 1.6 * 1000; // liters per meter
  const deadband = deadbandLiters(volume, tank.height);
  const period = periodBounds('daily', '2026-11-03', 7, 'America/Chicago');

  /** Water +0.04 m/h, oil +0.01 m/h, a 1 m water haul from hour 10 to 10.5, 5 mm gauge noise. */
  function flowbackTank(withInterface = true): GaugeSample[] {
    const n = noise(42, 0.005);
    const samples: GaugeSample[] = [];
    for (
      let t = period.start - 30 * MIN;
      t <= period.end + 30 * MIN;
      t += 5 * MIN
    ) {
      const h = (t - period.start) / HOUR;
      const hauled = h <= 10 ? 0 : h >= 10.5 ? 1 : (h - 10) / 0.5;
      const water = 1 + 0.04 * h - hauled;
      const oil = 0.5 + 0.01 * h;
      samples.push({
        t,
        level: water + oil + n(),
        interfaceLevel: withInterface ? water + n() : null,
      });
    }
    return samples;
  }

  it('finds the water haul, no oil removal, and reconciles produced = closing − opening + removed', () => {
    const r = buildTankFigures(flowbackTank(), period, volume, deadband);
    expect(r.hasInterface).toBe(true);
    expect(r.samples).toBe(288);
    expect(r.longestGapMinutes).toBe(5);

    const waterOut = r.removals.filter((e) => e.layer === 'water');
    expect(waterOut).toHaveLength(1);
    expect(waterOut[0].amountL).toBeGreaterThan(0.93 * area);
    expect(waterOut[0].amountL).toBeLessThan(1.03 * area);
    expect(r.removals.filter((e) => e.layer === 'oil')).toHaveLength(0);

    // true inflow over 24 h: water 0.96 m, oil 0.24 m
    expect(r.water!.produced! / area).toBeGreaterThan(0.9);
    expect(r.water!.produced! / area).toBeLessThan(1.02);
    expect(r.oil!.produced! / area).toBeGreaterThan(0.2);
    expect(r.oil!.produced! / area).toBeLessThan(0.28);

    for (const layer of [r.oil!, r.water!, r.total]) {
      expect(layer.produced!).toBeCloseTo(
        layer.closing! - layer.opening! + layer.removed,
        6,
      );
    }
    expect(r.total.removed).toBeCloseTo(r.oil!.removed + r.water!.removed, 6);
  });

  it('reports the total only for a gauge without an interface float', () => {
    const r = buildTankFigures(flowbackTank(false), period, volume, deadband);
    expect(r.hasInterface).toBe(false);
    expect(r.oil).toBeNull();
    expect(r.water).toBeNull();
    expect(r.removals.map((e) => e.layer)).toEqual(['total']);
    expect(r.total.produced).not.toBeNull();
  });

  it('leaves production empty when there are no readings', () => {
    const r = buildTankFigures([], period, volume, deadband);
    expect(r.opening).toBeNull();
    expect(r.total.produced).toBeNull();
    expect(r.samples).toBe(0);
    expect(r.longestGapMinutes).toBe(24 * 60);
  });
});
