import { formatFeetInches, L_PER_BBL } from './gauge-report.engine';
import type { GaugeReport, GaugeReportTank } from './gauge-report.service';

export type ReportUnits = 'imperial' | 'metric';

const PERIOD_LABEL = {
  daily: 'Daily (24 h)',
  day: 'Day shift (12 h)',
  night: 'Night shift (12 h)',
} as const;

/** "2026-11-03 07:00" on the pad clock */
export function formatLocal(iso: string, timeZone: string, withDate = true): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const time = `${get('hour')}:${get('minute')}`;
  return withDate ? `${get('year')}-${get('month')}-${get('day')} ${time}` : time;
}

/** Text cell: quoted when needed, and never read as a formula by a spreadsheet. */
function text(value: string | null | undefined): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function number(value: number | null | undefined, digits: number): string {
  return value == null || !Number.isFinite(value) ? '' : value.toFixed(digits);
}

export function buildGaugeReportCsv(report: GaugeReport, units: ReportUnits): string {
  const imperial = units === 'imperial';
  const tz = report.period.timeZone;
  const level = (m: number | null | undefined) =>
    m == null ? '' : imperial ? text(formatFeetInches(m)) : number(m, 3);
  const volume = (liters: number | null | undefined) =>
    liters == null ? '' : imperial ? number(liters / L_PER_BBL, 2) : number(liters / 1000, 3);
  const vu = imperial ? 'bbl' : 'm3';
  const lu = imperial ? 'ft-in' : 'm';

  const notes = (t: GaugeReportTank): string => {
    const out: string[] = [];
    if (!t.gaugeId) out.push('no level gauge on this tank');
    else if (t.samples === 0) out.push('no readings in the period');
    if (t.gaugeId && !t.opening) out.push('no reading near the opening time');
    if (t.gaugeId && !t.closing) out.push('no reading near the closing time');
    if (t.gaugeId && t.samples > 0 && !t.hasInterface) out.push('single-float gauge: total only');
    if (t.samples > 0 && t.longestGapMinutes >= 60) out.push(`longest gap ${t.longestGapMinutes} min`);
    for (const r of t.removals) {
      out.push(
        `${r.layer} out ${formatLocal(r.start, tz, false)}-${formatLocal(r.end, tz, false)}: ${volume(r.amountL)} ${vu}`,
      );
    }
    if (t.status !== 'active') out.push(`tank ${t.status}`);
    return out.join('; ');
  };

  const lines: string[] = [
    'NoRush gauge report',
    ['Period', PERIOD_LABEL[report.period.kind]].join(','),
    ['Gauge day', report.period.date].join(','),
    ['From', formatLocal(report.period.start, tz), 'To', formatLocal(report.period.end, tz), 'Time zone', text(tz)].join(','),
    ['Units', imperial ? 'level ft-in; volume bbl' : 'level m; volume m3'].join(','),
    ['Generated', report.generatedAt].join(','),
    [
      'Note',
      text(
        `Estimated from continuous gauge readings. Removed = drops over ${report.deadbandInches} in of level (hauls, transfers, draining). ` +
          'Produced = closing - opening + removed. No temperature correction; not for custody transfer.',
      ),
    ].join(','),
    '',
    [
      'Tank',
      'Name',
      'Gauge',
      `Opening top (${lu})`,
      `Opening interface (${lu})`,
      `Closing top (${lu})`,
      `Closing interface (${lu})`,
      `Oil opening (${vu})`,
      `Oil closing (${vu})`,
      `Oil removed (${vu})`,
      `Oil produced (${vu})`,
      `Water opening (${vu})`,
      `Water closing (${vu})`,
      `Water removed (${vu})`,
      `Water produced (${vu})`,
      `Total produced (${vu})`,
      `Max level (${lu})`,
      'High-level alarms',
      'Readings',
      'Longest gap (min)',
      'Notes',
    ].join(','),
  ];

  for (const t of report.tanks) {
    lines.push(
      [
        text(t.code),
        text(t.name),
        text(t.gaugeId),
        level(t.opening?.level),
        level(t.opening?.interfaceLevel),
        level(t.closing?.level),
        level(t.closing?.interfaceLevel),
        volume(t.oil?.opening),
        volume(t.oil?.closing),
        volume(t.oil?.removed),
        volume(t.oil?.produced),
        volume(t.water?.opening),
        volume(t.water?.closing),
        volume(t.water?.removed),
        volume(t.water?.produced),
        volume(t.total.produced),
        level(t.maxLevel),
        String(t.alarms.highLevel),
        String(t.samples),
        t.samples ? String(t.longestGapMinutes) : '',
        text(notes(t)),
      ].join(','),
    );
  }

  const s = report.totals;
  lines.push(
    [
      'Total', '', '', '', '', '', '', '',
      volume(s.oilClosingL),
      volume(s.oilRemovedL),
      volume(s.oilProducedL),
      '',
      volume(s.waterClosingL),
      volume(s.waterRemovedL),
      volume(s.waterProducedL),
      volume(s.totalProducedL),
      '', '', '', '', '',
    ].join(','),
  );

  // BOM so spreadsheet apps read the file as UTF-8
  return '﻿' + lines.join('\r\n') + '\r\n';
}
