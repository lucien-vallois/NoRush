import { AlertSeverity, AlertType } from '../../entities/alert.entity';
import { Tank } from '../../entities/tank.entity';

/**
 * Level alarms for a single reading, evaluated against the tank limits.
 *
 * Physical order of the limits, from the tank bottom:
 *   minimum ≤ low < high ≤ overflow
 *
 * `minimum` is the low-low limit (worse than `low`) and `overflow` is the
 * high-high limit (worse than `high`), so each pair escalates in severity.
 * A reading past the outer limit also trips the inner one; both alarms are
 * raised, each with its own cooldown.
 */
export type LevelAlarmKey = 'overflow' | 'high' | 'minimum' | 'low';

export interface LevelAlarm {
  key: LevelAlarmKey;
  type: AlertType;
  severity: AlertSeverity;
  /** Limit that was crossed, in meters. */
  threshold: number;
  /** Short English description, used in logs and realtime events. */
  reason: string;
}

type TankLimits = Pick<
  Tank,
  | 'maxLevelThreshold'
  | 'minLevelThreshold'
  | 'overflowThreshold'
  | 'lowLevelThreshold'
>;

interface LevelAlarmRule {
  key: LevelAlarmKey;
  type: AlertType;
  severity: AlertSeverity;
  limit: (tank: TankLimits) => number | null | undefined;
  direction: 'above' | 'below';
  label: string;
}

/** Ordered from most to least severe: the first match is the headline. */
const LEVEL_ALARM_RULES: readonly LevelAlarmRule[] = [
  {
    key: 'overflow',
    type: AlertType.OVERFLOW_RISK,
    severity: AlertSeverity.CRITICAL,
    limit: (tank) => tank.overflowThreshold,
    direction: 'above',
    label: 'Overflow risk',
  },
  {
    key: 'minimum',
    type: AlertType.LOW_LEVEL,
    severity: AlertSeverity.HIGH,
    limit: (tank) => tank.minLevelThreshold,
    direction: 'below',
    label: 'Minimum level',
  },
  {
    key: 'high',
    type: AlertType.HIGH_LEVEL,
    severity: AlertSeverity.MEDIUM,
    limit: (tank) => tank.maxLevelThreshold,
    direction: 'above',
    label: 'High level',
  },
  {
    key: 'low',
    type: AlertType.LOW_LEVEL,
    severity: AlertSeverity.MEDIUM,
    limit: (tank) => tank.lowLevelThreshold,
    direction: 'below',
    label: 'Low level',
  },
];

/**
 * Every level alarm the reading trips, most severe first. Limits that are
 * unset (null/undefined) or zero are skipped, matching the console, where an
 * empty limit means "not monitored".
 */
export function evaluateLevelAlarms(
  tank: TankLimits,
  level: number | null | undefined,
): LevelAlarm[] {
  if (typeof level !== 'number' || !Number.isFinite(level)) return [];

  const alarms: LevelAlarm[] = [];
  for (const rule of LEVEL_ALARM_RULES) {
    const raw = rule.limit(tank);
    const threshold = raw == null ? NaN : Number(raw);
    if (!Number.isFinite(threshold) || threshold <= 0) continue;

    const tripped =
      rule.direction === 'above' ? level >= threshold : level <= threshold;
    if (!tripped) continue;

    const op = rule.direction === 'above' ? '>=' : '<=';
    alarms.push({
      key: rule.key,
      type: rule.type,
      severity: rule.severity,
      threshold,
      reason: `${rule.label}: ${level} m ${op} ${threshold} m`,
    });
  }
  return alarms;
}
