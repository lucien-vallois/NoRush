import { ReadingsService } from './readings.service';

describe('ReadingsService operational latest readings', () => {
  let source: { query: jest.Mock };
  let service: ReadingsService;

  beforeEach(() => {
    source = {
      query: jest.fn(async () => [
        { id: 'tank-1', sensor_uuid: 'selected-sensor' },
      ]),
    };
    service = new ReadingsService(
      {} as never,
      {} as never,
      {} as never,
      source as never,
    );
  });

  it('delegates latest-by-tank to the selected operational level sensor', async () => {
    const expected = [{ id: 'reading-1' }];
    const latestBySensor = jest
      .spyOn(service, 'getLatestBySensor')
      .mockResolvedValue(expected as never);

    await expect(service.getLatestByTank('tank-1', 3)).resolves.toBe(expected);
    expect(latestBySensor).toHaveBeenCalledWith('selected-sensor', 3);
    const [sql, params] = source.query.mock.calls[0];
    expect(sql).toContain('LEFT JOIN sensors');
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("s.type::text <> 'float_switch'");
    expect(params).toEqual(['tank-1']);
  });

  it('returns no latest readings when the tank has no operational level sensor', async () => {
    source.query.mockResolvedValue([{ id: 'tank-1', sensor_uuid: null }]);
    const latestBySensor = jest.spyOn(service, 'getLatestBySensor');

    await expect(service.getLatestByTank('tank-1')).resolves.toEqual([]);
    expect(latestBySensor).not.toHaveBeenCalled();
  });

  it('keeps tank history scoped to all sensors', async () => {
    const findAll = jest
      .spyOn(service, 'findAll')
      .mockResolvedValue({} as never);

    await service.findByTank('tank-1', { limit: 20 });

    expect(findAll).toHaveBeenCalledWith({ tankId: 'tank-1', limit: 20 });
    expect(source.query).not.toHaveBeenCalled();
  });
});
