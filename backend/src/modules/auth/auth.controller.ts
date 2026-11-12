import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService, type AuthResponse } from './auth.service';
import { UserService } from './user.service';
import { CreateUserDto, LoginDto, RefreshTokenDto } from './auth.dto';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { User, UserRole } from '../../entities/user.entity';
import { I18nService } from '../../i18n/i18n.service';
import { CurrentLang } from '../../i18n/current-lang.decorator';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fazer login no sistema' })
  @ApiResponse({ status: 200, description: 'Login realizado com sucesso' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acesso' })
  @ApiResponse({ status: 200, description: 'Token renovado com sucesso' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido' })
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<AuthResponse> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sign out this session',
    description:
      'Refuses the access and refresh tokens of this session from now on. Other sessions of the same user stay signed in.',
  })
  @ApiResponse({ status: 200, description: 'Signed out' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentLang() lang: string,
  ): Promise<{ message: string }> {
    await this.authService.logout(user.id, user.sessionId);
    return { message: this.i18n.translate(lang, 'exceptions.logoutSuccess') };
  }

  @Post('logout/all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sign out everywhere',
    description: "Refuses every token issued to the user so far, on every device.",
  })
  @ApiResponse({ status: 200, description: 'Every session signed out' })
  async logoutEverywhere(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentLang() lang: string,
  ): Promise<{ message: string }> {
    await this.authService.logoutEverywhere(user.id);
    return { message: this.i18n.translate(lang, 'exceptions.logoutSuccess') };
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obter perfil do usuário atual' })
  @ApiResponse({ status: 200, description: 'Perfil obtido com sucesso' })
  async getProfile(@CurrentUser() user: User): Promise<Partial<User>> {
    return this.authService.getProfile(user.id);
  }

  @Post('users')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar novo usuário (Apenas Admin)' })
  @ApiResponse({ status: 201, description: 'Usuário criado com sucesso' })
  @ApiResponse({ status: 403, description: 'Acesso negado' })
  async createUser(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Get('users')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos os usuários (Apenas Admin)' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários obtida com sucesso',
  })
  async getUsers(): Promise<User[]> {
    return this.userService.findAll();
  }
}
