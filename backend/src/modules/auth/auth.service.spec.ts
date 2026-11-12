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
    incrementTokenVersion: jest.fn(),
  };
  const user = {
    id: 'operator-id',
    email: 'operator@example.test',
    name: 'Operator',
    role: UserRole.OPERATOR,
    isActive: true,
    tokenVersion: 0,
  };
  const revoked = new Map<string, Date>();
  const sessions = {
    revoke: jest.fn(async (sid: string, _userId: string, expiresAt: Date) => {
      revoked.set(sid, expiresAt);
    }),
    isRevoked: jest.fn(async (sid: string) => revoked.has(sid)),
  };
  let auth: AuthService;
  beforeEach(() => {
    jest.clearAllMocks();
    revoked.clear();
    users.validatePassword.mockResolvedValue({
      ...user,
      passwordHash: 'never-expose',
    });
    users.findById.mockResolvedValue(user);
    auth = new AuthService(users as never, jwt, config, sessions as never);
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
  it('signs out only the session that logs out', async () => {
    const first = await auth.login({ email: user.email, password: 'test' });
    const second = await auth.login({ email: user.email, password: 'test' });
    const firstSid = jwt.decode(first.accessToken).sid;
    expect(firstSid).toBeDefined();
    expect(jwt.decode(second.accessToken).sid).not.toBe(firstSid);

    await auth.logout(user.id, firstSid);

    expect(users.incrementTokenVersion).not.toHaveBeenCalled();
    const [, , expiresAt] = sessions.revoke.mock.calls[0];
    // kept until the session's refresh token (7d by default) would expire
    expect(expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86400e3);

    expect(await auth.validateToken(first.accessToken)).toBeNull();
    await expect(
      auth.refreshToken({ refreshToken: first.refreshToken }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // Another person on the same shared demo account stays signed in
    expect(await auth.validateToken(second.accessToken)).toEqual(user);
    await expect(
      auth.refreshToken({ refreshToken: second.refreshToken }),
    ).resolves.toHaveProperty('accessToken');
  });
  it('keeps the session id across refreshes, so logout after a refresh still works', async () => {
    const tokens = await auth.login({ email: user.email, password: 'test' });
    const next = await auth.refreshToken({ refreshToken: tokens.refreshToken });
    const sid = jwt.decode(tokens.accessToken).sid;
    expect(jwt.decode(next.accessToken).sid).toBe(sid);

    await auth.logout(user.id, jwt.decode(next.accessToken).sid);
    expect(await auth.validateToken(tokens.accessToken)).toBeNull();
    expect(await auth.validateToken(next.accessToken)).toBeNull();
  });
  it('signs out everywhere by bumping the token version', async () => {
    const tokens = await auth.login({ email: user.email, password: 'test' });
    await auth.logoutEverywhere(user.id);
    expect(users.incrementTokenVersion).toHaveBeenCalledWith(user.id);

    users.findById.mockResolvedValue({ ...user, tokenVersion: 1 });
    expect(await auth.validateToken(tokens.accessToken)).toBeNull();
    await expect(
      auth.refreshToken({ refreshToken: tokens.refreshToken }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('falls back to signing out everywhere for tokens issued without a session id', async () => {
    await auth.logout(user.id, undefined);
    expect(users.incrementTokenVersion).toHaveBeenCalledWith(user.id);
    expect(sessions.revoke).not.toHaveBeenCalled();
  });
  it('keeps the current session valid when the version matches', async () => {
    const tokens = await auth.login({ email: user.email, password: 'test' });
    expect(await auth.validateToken(tokens.accessToken)).toEqual(user);
    const next = await auth.refreshToken({ refreshToken: tokens.refreshToken });
    expect(jwt.decode(next.accessToken)).toMatchObject({
      sub: user.id,
      tokenUse: 'access',
      tokenVersion: 0,
    });
  });
});
