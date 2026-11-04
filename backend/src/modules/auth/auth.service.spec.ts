import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { jwtConfig } from '../../config/jwt.config';
import { UserRole } from '../../entities/user.entity';

describe('Authentication', () => {
  const config = new ConfigService({
    JWT_SECRET: 'test-access-secret',
    JWT_REFRESH_SECRET: 'test-refresh-secret',
    JWT_EXPIRE: '15m',
  });
  const jwt = new JwtService(jwtConfig(config));
  const users = {
    validatePassword: jest.fn(),
    findById: jest.fn(),
    updateLastLogin: jest.fn(),
  };
  const user = {
    id: 'operator-id',
    email: 'operator@example.test',
    name: 'Operator',
    role: UserRole.OPERATOR,
    isActive: true,
  };
  let auth: AuthService;
  beforeEach(() => {
    jest.clearAllMocks();
    users.validatePassword.mockResolvedValue({
      ...user,
      passwordHash: 'never-expose',
    });
    users.findById.mockResolvedValue(user);
    auth = new AuthService(users as never, jwt, config);
  });
  it('issues separate token purposes and the actual configured lifetime', async () => {
    const result = await auth.login({
      email: user.email,
      password: 'test-password',
    });
    expect(result.expiresIn).toBe(900);
    expect(jwt.decode(result.accessToken)).toMatchObject({
      sub: user.id,
      tokenUse: 'access',
    });
    expect(
      jwt.verify(result.refreshToken, { secret: 'test-refresh-secret' })
        .tokenUse,
    ).toBe('refresh');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(users.updateLastLogin).toHaveBeenCalledTimes(1);
  });
  it('rejects incorrect credentials', async () => {
    users.validatePassword.mockResolvedValue(null);
    await expect(
      auth.login({ email: user.email, password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('rejects inactive accounts even if the password matches', async () => {
    users.validatePassword.mockResolvedValue({ ...user, isActive: false });
    await expect(
      auth.login({ email: user.email, password: 'correct' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('validates a real signed access token', async () => {
    const result = await auth.login({ email: user.email, password: 'test' });
    expect(await auth.validateToken(result.accessToken)).toEqual(user);
  });
  it('rejects refresh tokens on the access channel', async () => {
    const token = jwt.sign({ sub: user.id, tokenUse: 'refresh' });
    expect(await auth.validateToken(token)).toBeNull();
  });
  it('rejects expired tokens and disabled users on the access channel', async () => {
    expect(
      await auth.validateToken(
        jwt.sign({ sub: user.id, tokenUse: 'access' }, { expiresIn: -1 }),
      ),
    ).toBeNull();
    users.findById.mockResolvedValue({ ...user, isActive: false });
    expect(
      await auth.validateToken(jwt.sign({ sub: user.id, tokenUse: 'access' })),
    ).toBeNull();
  });
  it('refreshes using the current database role', async () => {
    const tokens = await auth.login({ email: user.email, password: 'test' });
    users.findById.mockResolvedValue({ ...user, role: UserRole.MAINTENANCE });
    const next = await auth.refreshToken({ refreshToken: tokens.refreshToken });
    expect(jwt.decode(next.accessToken)).toMatchObject({
      role: UserRole.MAINTENANCE,
    });
  });
  it('rejects tokens without the refresh purpose and foreign issuers', async () => {
    const noPurpose = jwt.sign(
      { sub: user.id },
      { secret: 'test-refresh-secret' },
    );
    await expect(
      auth.refreshToken({ refreshToken: noPurpose }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const foreign = jwt.sign(
      { sub: user.id, tokenUse: 'refresh' },
      { secret: 'test-refresh-secret', issuer: 'foreign' },
    );
    await expect(
      auth.refreshToken({ refreshToken: foreign }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
