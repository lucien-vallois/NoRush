import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user.service';
import { AuthService, TokenClaims } from '../auth.service';
import { User } from '../../../entities/user.entity';

/** The signed-in user on a request, with the session its token belongs to. */
export type AuthenticatedUser = User & { sessionId?: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>(
        'JWT_SECRET',
        'your-super-secret-key',
      ),
      issuer: 'flowback-iiot-platform',
      audience: 'flowback-users',
    });
  }

  async validate(payload: TokenClaims): Promise<AuthenticatedUser> {
    if (payload.tokenUse !== 'access') {
      throw new UnauthorizedException({ code: 'invalidToken' });
    }

    const user = await this.userService.findById(payload.sub);
    if (!user) throw new UnauthorizedException({ code: 'userNotFound' });
    if (!user.isActive)
      throw new UnauthorizedException({ code: 'userInactive' });

    // Signed out (this session, or everywhere): refused until it expires
    if (!(await this.authService.isSessionCurrent(payload, user))) {
      throw new UnauthorizedException({ code: 'invalidToken' });
    }

    return Object.assign(user, { sessionId: payload.sid });
  }
}
