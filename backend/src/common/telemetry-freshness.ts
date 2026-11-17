export const READING_MAX_AGE_SECONDS = 15 * 60;
export const HEARTBEAT_MAX_AGE_SECONDS = 5 * 60;

export interface TelemetryFreshness {
  fresh: boolean;
  ageSeconds: number | null;
  maxAgeSeconds: number;
}

export function telemetryFreshness(
  timestamp: Date | string | null | undefined,
  asOf: Date,
  maxAgeSeconds: number,
): TelemetryFreshness {
  const timestampMs = timestamp == null ? NaN : new Date(timestamp).getTime();
  const ageMs = asOf.getTime() - timestampMs;

  if (!Number.isFinite(timestampMs) || !Number.isFinite(ageMs) || ageMs < 0) {
    return { fresh: false, ageSeconds: null, maxAgeSeconds };
  }

  return {
    fresh: ageMs <= maxAgeSeconds * 1000,
    ageSeconds: Math.floor(ageMs / 1000),
    maxAgeSeconds,
  };
}

export function readingFreshness(
  timestamp: Date | string | null | undefined,
  asOf: Date,
): TelemetryFreshness {
  return telemetryFreshness(timestamp, asOf, READING_MAX_AGE_SECONDS);
}

export function heartbeatFreshness(
  timestamp: Date | string | null | undefined,
  asOf: Date,
): TelemetryFreshness {
  return telemetryFreshness(timestamp, asOf, HEARTBEAT_MAX_AGE_SECONDS);
}
