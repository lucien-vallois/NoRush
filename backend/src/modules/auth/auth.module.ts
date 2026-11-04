import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Entities
import { User } from '../../entities/user.entity';

// Services
import { UserService } from './user.service';
import { AuthService } from './auth.service';

// Controllers
import { AuthController } from './auth.controller';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';

// Config
import { jwtConfig } from '../../config/jwt.config';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: jwtConfig,
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, UserService, JwtStrategy],
  exports: [AuthService, UserService, JwtModule],
})
export class AuthModule {}
