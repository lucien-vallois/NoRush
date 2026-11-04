/** A separator prevents a chart from suggesting measurements during a telemetry gap. */
export function withTelemetryGaps<T extends { t: number }>(
  points: readonly T[],
  intervalMs: number,
  reference: readonly T[] = points,
): Array<T | { t: number }> {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0)
    throw new RangeError("Invalid telemetry interval");
  const result: Array<T | { t: number }> = [...points];
  reference.forEach((point, index) => {
    const previous = reference[index - 1];
    if (previous && point.t - previous.t > intervalMs * 1.5)
      result.push({ t: previous.t + intervalMs });
  });
  return result.sort((a, b) => a.t - b.t);
}
