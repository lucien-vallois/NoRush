import { nominalVolumeLiters, validateTankConfig } from './tank-config';

describe('Tank configuration rules', () => {
  const dims = { height: 6.1, diameter: 3.66 };

  it('accepts a cylinder with ordered limits and no strapping table', () => {
    expect(
      validateTankConfig({
        dimensions: dims,
        minLevelThreshold: 0.3,
        lowLevelThreshold: 0.5,
        maxLevelThreshold: 5.2,
        overflowThreshold: 5.6,
      }),
    ).toBeNull();
  });

  it('rejects missing or non-positive dimensions', () => {
    expect(validateTankConfig({ dimensions: { height: 0, diameter: 3 } })).toBe(
      'tankDimensionsInvalid',
    );
    expect(validateTankConfig({ dimensions: null })).toBe(
      'tankDimensionsInvalid',
    );
  });

  it('rejects limits out of order or above the tank height', () => {
    expect(
      validateTankConfig({
        dimensions: dims,
        maxLevelThreshold: 5.6,
        overflowThreshold: 5.2,
      }),
    ).toBe('tankThresholdsOrder');
    expect(
      validateTankConfig({
        dimensions: dims,
        lowLevelThreshold: 2,
        maxLevelThreshold: 2,
      }),
    ).toBe('tankThresholdsOrder');
    expect(validateTankConfig({ dimensions: dims, overflowThreshold: 7 })).toBe(
      'tankThresholdAboveHeight',
    );
  });

  it('validates the strapping table shape', () => {
    const ok = [
      { level: 0, volume: 0 },
      { level: 3, volume: 31000 },
      { level: 6.1, volume: 64000 },
    ];
    expect(
      validateTankConfig({ dimensions: dims, arqueacaoTable: ok }),
    ).toBeNull();
    expect(
      validateTankConfig({ dimensions: dims, arqueacaoTable: [ok[0]] }),
    ).toBe('strappingTableInvalid');
    expect(
      validateTankConfig({
        dimensions: dims,
        arqueacaoTable: [ok[1], ok[0]],
      }),
    ).toBe('strappingTableInvalid');
    expect(
      validateTankConfig({
        dimensions: dims,
        arqueacaoTable: [
          { level: 0, volume: 100 },
          { level: 1, volume: 50 },
        ],
      }),
    ).toBe('strappingTableInvalid');
    expect(
      validateTankConfig({
        dimensions: dims,
        arqueacaoTable: [
          { level: 0, volume: 0 },
          { level: 9, volume: 90000 },
        ],
      }),
    ).toBe('strappingTableInvalid');
  });

  it('derives the nominal volume from the table or the cylinder', () => {
    expect(
      nominalVolumeLiters(dims, [
        { level: 0, volume: 0 },
        { level: 6.1, volume: 64000 },
      ]),
    ).toBe(64000);
    expect(nominalVolumeLiters({ height: 5, diameter: 3.2 })).toBe(40212);
  });
});
