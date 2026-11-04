import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { buildGaugeReportCsv } from './gauge-report.csv';
import { L_PER_BBL } from './gauge-report.engine';
import { GaugeReport, GaugeReportService } from './gauge-report.service';

const bbl = (n: number) => n * L_PER_BBL;

function report(): GaugeReport {
  return {
    period: {
      kind: 'daily',
      date: '2026-11-03',
      startHour: 7,
      timeZone: 'America/Chicago',
      start: '2026-11-03T13:00:00.000Z',
      end: '2026-11-04T13:00:00.000Z',
      hours: 24,
    },
    generatedAt: '2026-11-04T14:00:00.000Z',
    deadbandInches: 2,
    tanks: [
      {
        tankId: 't1',
        code: 'FK-01',
        name: '=HYPERLINK("x"), "north"',
        status: 'active',
        gaugeId: 'SENSOR-001',
        highLevelThreshold: 4.2,
        hasInterface: true,
        opening: { at: '2026-11-03T13:00:00.000Z', level: 3.7719, interfaceLevel: 2.54, totalL: bbl(300), oilL: bbl(100), waterL: bbl(200) },
        closing: { at: '2026-11-04T13:00:00.000Z', level: 3.048, interfaceLevel: 1.8288, totalL: bbl(250), oilL: bbl(110), waterL: bbl(140) },
        total: { opening: bbl(300), closing: bbl(250), removed: bbl(120), produced: bbl(70) },
        oil: { opening: bbl(100), closing: bbl(110), removed: 0, produced: bbl(10) },
        water: { opening: bbl(200), closing: bbl(140), removed: bbl(120), produced: bbl(60) },
        removals: [{ layer: 'water', start: '2026-11-03T16:40:00.000Z', end: '2026-11-03T17:10:00.000Z', amountL: bbl(120) }],
        maxLevel: 3.9,
        samples: 288,
        longestGapMinutes: 5,
        alarms: { highLevel: 1, overflowRisk: 0, offline: 0, total: 1 },
      },
    ],
    totals: {
      oilProducedL: bbl(10),
      waterProducedL: bbl(60),
      totalProducedL: bbl(70),
      oilRemovedL: 0,
      waterRemovedL: bbl(120),
      totalRemovedL: bbl(120),
      oilClosingL: bbl(110),
      waterClosingL: bbl(140),
    },
  };
}

describe('buildGaugeReportCsv', () => {
  it('writes gauges in ft-in, volumes in bbl and haul times on the pad clock', () => {
    const csv = buildGaugeReportCsv(report(), 'imperial');
    expect(csv.startsWith('﻿NoRush gauge report')).toBe(true);
    expect(csv).toContain('From,2026-11-03 07:00,To,2026-11-04 07:00,Time zone,America/Chicago');
    const row = csv.split('\r\n').find((l) => l.startsWith('FK-01'))!;
    expect(row).toContain(`"12' 4 1/2"""`);
    expect(row).toContain(',100.00,110.00,0.00,10.00,200.00,140.00,120.00,60.00,70.00,');
    expect(row).toContain('water out 10:40-11:10: 120.00 bbl');
  });

  it('keeps a tank name from running as a spreadsheet formula', () => {
    const csv = buildGaugeReportCsv(report(), 'imperial');
    expect(csv).toContain(`"'=HYPERLINK(""x""), ""north"""`);
  });

  it('writes meters and cubic meters in metric', () => {
    const csv = buildGaugeReportCsv(report(), 'metric');
    const row = csv.split('\r\n').find((l) => l.startsWith('FK-01'))!;
    expect(row).toContain(',3.772,2.540,3.048,1.829,');
    expect(csv).toContain('Oil produced (m3)');
  });
});

describe('GaugeReportService.resolve', () => {
  const config = { get: (_key: string, fallback: unknown) => fallback } as unknown as ConfigService;
  const service = new GaugeReportService({} as DataSource, config);
  const now = Date.parse('2026-11-04T15:00:00Z');

  it('defaults to the last completed gauge day', () => {
    expect(service.resolve({ tz: 'America/Chicago' }, now)).toEqual({
      kind: 'daily',
      date: '2026-11-03',
      startHour: 7,
      timeZone: 'America/Chicago',
    });
  });

  it.each([
    [{ period: 'weekly' }, 'invalidReportPeriod'],
    [{ startHour: '25' }, 'invalidStartHour'],
    [{ startHour: '7.5' }, 'invalidStartHour'],
    [{ tz: 'Mars/Olympus' }, 'invalidTimeZone'],
    [{ date: '2026-13-01' }, 'invalidReportDate'],
  ])('rejects %j', (query, code) => {
    try {
      service.resolve(query, now);
      fail('expected an error');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({ code });
    }
  });
});
