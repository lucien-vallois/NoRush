import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import { User } from '../../entities/user.entity';
import { LoginDto, RefreshTokenDto } from './auth.dto';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Partial<User>;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const { email, password } = loginDto;

    // Valida as credenciais
    const user = await this.userService.validatePassword(email, password);
    if (!user || !user.isActive) {
      this.logger.warn(`Tentativa de login falhada para: ${email}`);
      throw new UnauthorizedException({ code: 'invalidCredentials' });
    }

    // Gera os tokens
    await this.userService.updateLastLogin(user.id);
    const tokens = await this.generateTokens(user);

    // Remove dados sensíveis da resposta
    const { passwordHash, ...userResponse } = user;

    this.logger.log(`Login bem-sucedido para: ${email} (${user.role})`);

    return {
      ...tokens,
      user: userResponse,
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<AuthResponse> {
    const { refreshToken } = refreshTokenDto;

    try {
      // Verifica o refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'your-refresh-secret-key',
        ),
        issuer: 'flowback-iiot-platform',
        audience: 'flowback-users',
      });

      if (payload.tokenUse !== 'refresh') throw new UnauthorizedException();

      // Busca o usuário
      const user = await this.userService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException({ code: 'userNotFound' });
      }

      if (!user.isActive) {
        throw new UnauthorizedException({ code: 'userInactive' });
      }

      // Gera novos tokens
      const tokens = await this.generateTokens(user);
      const { passwordHash, ...userResponse } = user;

      this.logger.log(`Refresh token bem-sucedido para: ${user.email}`);

      return {
        ...tokens,
        user: userResponse,
      };
    } catch (error) {
      this.logger.warn(`Refresh token falhado: ${error.message}`);
      throw new UnauthorizedException({ code: 'invalidRefreshToken' });
    }
  }

  private async generateTokens(
    user: User,
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(
      { ...payload, tokenUse: 'access' },
      {
        expiresIn: this.configService.get<string>('JWT_EXPIRE', '24h'),
      },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, tokenUse: 'refresh' },
      {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRE', '7d'),
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'your-refresh-secret-key',
        ),
      },
    );

    // Calcula o tempo de expiração em segundos
    const claims = this.jwtService.decode(accessToken) as {
      exp: number;
      iat: number;
    };
    const expiresIn = claims.exp - claims.iat;

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  async validateToken(token: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(token, {
        issuer: 'flowback-iiot-platform',
        audience: 'flowback-users',
      });
      if (payload.tokenUse !== 'access') return null;
      const user = await this.userService.findById(payload.sub);
      return user?.isActive ? user : null;
    } catch (error) {
      return null;
    }
  }

  async logout(userId: string): Promise<void> {
    // Em uma implementação mais avançada, você poderia:
    // 1. Adicionar o token a uma blacklist
    // 2. Invalidar sessões ativas
    // 3. Limpar cache de permissões

    this.logger.log(`Logout realizado para usuário: ${userId}`);
  }

  async getProfile(userId: string): Promise<Partial<User>> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({ code: 'userNotFound' });
    }

    const { passwordHash, ...profile } = user;
    return profile;
  }

  // Método para verificar se um usuário tem permissão para uma ação
  async hasPermission(
    userId: string,
    requiredRoles: string[],
  ): Promise<boolean> {
    const user = await this.userService.findById(userId);
    if (!user) return false;

    return requiredRoles.includes(user.role);
  }

  // Método para obter informações de auditoria
  getAuditInfo(user: User): any {
    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      timestamp: new Date(),
      ip: '', // Pode ser preenchido pelo interceptor
      userAgent: '', // Pode ser preenchido pelo interceptor
    };
  }
}
