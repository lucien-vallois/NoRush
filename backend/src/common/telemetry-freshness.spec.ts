import {
  heartbeatFreshness,
  readingFreshness,
  telemetryFreshness,
} from './telemetry-freshness';

describe('Telemetry freshness', () => {
  const asOf = new Date('2026-11-01T12:00:00.000Z');
  const secondsAgo = (seconds: number) =>
    new Date(asOf.getTime() - seconds * 1000).toISOString();

  it.each([
    [0, true, 0],
    [900, true, 900],
    [900.001, false, 900],
    [901, false, 901],
  ])(
    'applies the 15-minute reading boundary at %s seconds',
    (age, fresh, ageSeconds) => {
      expect(readingFreshness(secondsAgo(age), asOf)).toEqual({
        fresh,
        ageSeconds,
        maxAgeSeconds: 900,
      });
    },
  );

  it.each([
    [300, true],
    [300.001, false],
  ])(
    'applies the five-minute heartbeat boundary at %s seconds',
    (age, fresh) => {
      expect(heartbeatFreshness(secondsAgo(age), asOf)).toMatchObject({
        fresh,
        maxAgeSeconds: 300,
      });
    },
  );

  it.each([null, undefined, '', 'not-a-date', '2026-11-01T12:00:00.001Z'])(
    'marks missing, invalid or future timestamp %s as stale with unknown age',
    (timestamp) => {
      expect(readingFreshness(timestamp, asOf)).toEqual({
        fresh: false,
        ageSeconds: null,
        maxAgeSeconds: 900,
      });
    },
  );

  it('does not calculate age from an invalid reference time', () => {
    expect(telemetryFreshness(asOf, new Date('invalid'), 900)).toEqual({
      fresh: false,
      ageSeconds: null,
      maxAgeSeconds: 900,
    });
  });
});
