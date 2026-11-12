import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { UserService } from './user.service';
import { SessionService } from './session.service';
import { User } from '../../entities/user.entity';
import { LoginDto, RefreshTokenDto } from './auth.dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Partial<User>;
  expiresIn: number;
}

/** Claims shared by access and refresh tokens. */
export interface TokenClaims {
  sub: string;
  email: string;
  role: string;
  /** Bumped by "sign out everywhere": older tokens of the user are refused. */
  tokenVersion?: number;
  /** Session id: one per sign-in, kept across refreshes, revoked on logout. */
  sid?: string;
  tokenUse?: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

const ISSUER = 'flowback-iiot-platform';
const AUDIENCE = 'flowback-users';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private sessions: SessionService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    const user = await this.userService.validatePassword(email, password);
    if (!user || !user.isActive) {
      this.logger.warn(`Failed sign-in for ${email}`);
      throw new UnauthorizedException({ code: 'invalidCredentials' });
    }

    await this.userService.updateLastLogin(user.id);
    const tokens = this.generateTokens(user, randomUUID());
    const { passwordHash: _passwordHash, ...userResponse } = user;

    this.logger.log(`Signed in: ${email} (${user.role})`);
    return { ...tokens, user: userResponse };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponse> {
    try {
      const payload = this.jwtService.verify<TokenClaims>(
        refreshTokenDto.refreshToken,
        {
          secret: this.refreshSecret(),
          issuer: ISSUER,
          audience: AUDIENCE,
        },
      );
      if (payload.tokenUse !== 'refresh') throw new UnauthorizedException();

      const user = await this.userService.findById(payload.sub);
      if (!user) throw new UnauthorizedException({ code: 'userNotFound' });
      if (!user.isActive) throw new UnauthorizedException({ code: 'userInactive' });
      if (!(await this.isSessionCurrent(payload, user))) {
        throw new UnauthorizedException({ code: 'invalidRefreshToken' });
      }

      // Same session id: a refresh continues the sign-in, it does not start one.
      const tokens = this.generateTokens(user, payload.sid ?? randomUUID());
      const { passwordHash: _passwordHash, ...userResponse } = user;
      return { ...tokens, user: userResponse };
    } catch (error) {
      this.logger.warn(
        `Refresh refused: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException({ code: 'invalidRefreshToken' });
    }
  }

  /** Access token check for channels outside Passport (the WebSocket). */
  async validateToken(token: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify<TokenClaims>(token, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (payload.tokenUse !== 'access') return null;
      const user = await this.userService.findById(payload.sub);
      if (!user?.isActive) return null;
      return (await this.isSessionCurrent(payload, user)) ? user : null;
    } catch {
      return null;
    }
  }

  /**
   * A token is current when its user-wide version matches (no "sign out
   * everywhere" since it was issued) and its own session was not signed out.
   */
  async isSessionCurrent(payload: TokenClaims, user: User): Promise<boolean> {
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) return false;
    if (payload.sid && (await this.sessions.isRevoked(payload.sid))) return false;
    return true;
  }

  /**
   * Signs out one session: its access and refresh tokens are refused from
   * now on; the user's other sessions are untouched. Tokens issued before
   * session ids existed have no `sid`, so they fall back to signing out
   * everywhere.
   */
  async logout(userId: string, sid?: string): Promise<void> {
    if (!sid) {
      await this.logoutEverywhere(userId);
      return;
    }
    const expiresAt = new Date(Date.now() + this.refreshLifetimeSeconds() * 1000);
    await this.sessions.revoke(sid, userId, expiresAt);
    this.logger.log(`Signed out session ${sid.slice(0, 8)} of user ${userId}`);
  }

  async logoutEverywhere(userId: string): Promise<void> {
    await this.userService.incrementTokenVersion(userId);
    this.logger.log(`Signed out every session of user ${userId}`);
  }

  async getProfile(userId: string): Promise<Partial<User>> {
    const user = await this.userService.findById(userId);
    if (!user) throw new UnauthorizedException({ code: 'userNotFound' });
    const { passwordHash: _passwordHash, ...profile } = user;
    return profile;
  }

  private generateTokens(
    user: User,
    sid: string,
  ): { accessToken: string; refreshToken: string; expiresIn: number } {
    const claims: TokenClaims = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion ?? 0,
      sid,
    };

    const accessToken = this.jwtService.sign(
      { ...claims, tokenUse: 'access' },
      { expiresIn: this.configService.get<string>('JWT_EXPIRE', '24h') },
    );
    const refreshToken = this.jwtService.sign(
      { ...claims, tokenUse: 'refresh' },
      { expiresIn: this.refreshExpire(), secret: this.refreshSecret() },
    );

    const { exp, iat } = this.jwtService.decode<{ exp: number; iat: number }>(
      accessToken,
    );
    return { accessToken, refreshToken, expiresIn: exp - iat };
  }

  /** Lifetime of a refresh token, as configured (e.g. "7d"), in seconds. */
  private refreshLifetimeSeconds(): number {
    const probe = this.jwtService.sign(
      { probe: true },
      { expiresIn: this.refreshExpire(), secret: this.refreshSecret() },
    );
    const { exp, iat } = this.jwtService.decode<{ exp: number; iat: number }>(
      probe,
    );
    return exp - iat;
  }

  private refreshExpire(): string {
    return this.configService.get<string>('JWT_REFRESH_EXPIRE', '7d');
  }

  private refreshSecret(): string {
    return this.configService.get<string>(
      'JWT_REFRESH_SECRET',
      'your-refresh-secret-key',
    );
  }
}
