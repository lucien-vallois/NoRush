import { DemoSeedService } from './demo-seed.service';
import { seedDatabase } from './seed-data';

jest.mock('./seed-data', () => ({ seedDatabase: jest.fn() }));

describe('DemoSeedService', () => {
  const originalEnv = { ...process.env };
  const repositories = () => ({
    userRepo: {},
    tankRepo: { count: jest.fn().mockResolvedValue(0) },
    sensorRepo: {},
    readingRepo: {},
    alertRepo: {},
  });

  const createService = (repos: ReturnType<typeof repositories>) =>
    new DemoSeedService(
      repos.userRepo as any,
      repos.tankRepo as any,
      repos.sensorRepo as any,
      repos.readingRepo as any,
      repos.alertRepo as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.DEMO_AUTO_SEED;
    process.env.NODE_ENV = 'development';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does nothing unless auto-seed is explicitly enabled', async () => {
    const repos = repositories();

    await createService(repos).onModuleInit();

    expect(repos.tankRepo.count).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it('refuses to create demonstration credentials in production', async () => {
    const repos = repositories();
    process.env.NODE_ENV = 'production';
    process.env.DEMO_AUTO_SEED = 'true';

    await expect(createService(repos).onModuleInit()).rejects.toThrow(
      'DEMO_AUTO_SEED cannot be enabled in production',
    );
    expect(repos.tankRepo.count).not.toHaveBeenCalled();
    expect(seedDatabase).not.toHaveBeenCalled();
  });

  it('keeps opt-in auto-seed available outside production', async () => {
    const repos = repositories();
    process.env.DEMO_AUTO_SEED = 'true';

    await createService(repos).onModuleInit();

    expect(repos.tankRepo.count).toHaveBeenCalledTimes(1);
    expect(seedDatabase).toHaveBeenCalledWith({
      userRepo: repos.userRepo,
      tankRepo: repos.tankRepo,
      sensorRepo: repos.sensorRepo,
      readingRepo: repos.readingRepo,
      alertRepo: repos.alertRepo,
    });
  });
});
