import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../user.service';
import { User } from '../../../entities/user.entity';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  tokenUse?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private userService: UserService,
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

  async validate(payload: JwtPayload): Promise<User> {
    if (payload.tokenUse !== 'access')
      throw new UnauthorizedException({ code: 'invalidToken' });
    const { sub: userId, email } = payload;

    // Busca o usuário no banco de dados
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new UnauthorizedException({ code: 'userNotFound' });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({ code: 'userInactive' });
    }

    // Sessão revogada (logout): recusa o access token até ele expirar
    if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException({ code: 'invalidToken' });
    }

    return user;
  }
}
