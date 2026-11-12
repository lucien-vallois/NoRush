import { AlertSeverity, AlertType } from '../../entities/alert.entity';
import { evaluateLevelAlarms } from './level-alarms';

// Seed tank: minimum 0.3 ≤ low 0.5 < high 4.2 ≤ overflow 4.6 (meters)
const tank = {
  minLevelThreshold: 0.3,
  lowLevelThreshold: 0.5,
  maxLevelThreshold: 4.2,
  overflowThreshold: 4.6,
};

const keys = (level: number) =>
  evaluateLevelAlarms(tank, level).map((alarm) => alarm.key);

describe('evaluateLevelAlarms', () => {
  it('raises nothing inside the normal band', () => {
    expect(evaluateLevelAlarms(tank, 2.5)).toEqual([]);
  });

  it('raises the low alarm between minimum and low (it used to be skipped)', () => {
    const [alarm, ...rest] = evaluateLevelAlarms(tank, 0.4);
    expect(rest).toEqual([]);
    expect(alarm).toMatchObject({
      key: 'low',
      type: AlertType.LOW_LEVEL,
      severity: AlertSeverity.MEDIUM,
      threshold: 0.5,
    });
  });

  it('escalates at the minimum limit, more severe than low, and reports the minimum threshold', () => {
    const [headline] = evaluateLevelAlarms(tank, 0.25);
    expect(keys(0.25)).toEqual(['minimum', 'low']);
    expect(headline).toMatchObject({
      type: AlertType.LOW_LEVEL,
      severity: AlertSeverity.HIGH,
      threshold: 0.3,
    });
  });

  it('raises high at the high limit and leads with overflow past it', () => {
    expect(keys(4.3)).toEqual(['high']);
    expect(keys(4.7)).toEqual(['overflow', 'high']);
    expect(evaluateLevelAlarms(tank, 4.7)[0]).toMatchObject({
      type: AlertType.OVERFLOW_RISK,
      severity: AlertSeverity.CRITICAL,
      threshold: 4.6,
    });
  });

  it('treats limits as inclusive', () => {
    expect(keys(4.2)).toEqual(['high']);
    expect(keys(0.5)).toEqual(['low']);
  });

  it('skips unset or zero limits and invalid levels', () => {
    expect(
      evaluateLevelAlarms(
        { ...tank, overflowThreshold: null as never, minLevelThreshold: 0 },
        4.9,
      ).map((a) => a.key),
    ).toEqual(['high']);
    expect(evaluateLevelAlarms(tank, NaN)).toEqual([]);
    expect(evaluateLevelAlarms(tank, undefined)).toEqual([]);
  });

  it('accepts limits that arrive as numeric strings from the database driver', () => {
    expect(
      evaluateLevelAlarms(
        { ...tank, maxLevelThreshold: '4.20' as never },
        4.25,
      ).map((a) => a.key),
    ).toEqual(['high']);
  });
});
