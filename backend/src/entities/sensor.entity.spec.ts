import { Sensor } from './sensor.entity';

describe('Gauge battery status', () => {
  const status = (level: number | null | undefined) =>
    Object.assign(new Sensor(), { batteryLevel: level }).getBatteryStatus();

  it('rates the reported level', () => {
    expect(status(68)).toBe('good');
    expect(status(20)).toBe('good');
    expect(status(15)).toBe('warning');
    expect(status(9)).toBe('critical');
  });

  it('treats an empty battery as critical, not as unknown', () => {
    expect(status(0)).toBe('critical');
    expect(status(undefined)).toBe('warning');
    expect(status(null)).toBe('warning');
  });
});
