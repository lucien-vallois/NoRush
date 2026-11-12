import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';

// Controllers
import { AppController } from './app.controller';

// Services
import { AppService } from './app.service';
import { DemoSeedService } from './demo-seed.service';

// Entities
import { User } from './entities/user.entity';
import { Tank } from './entities/tank.entity';
import { Sensor } from './entities/sensor.entity';
import { Reading } from './entities/reading.entity';
import { Alert } from './entities/alert.entity';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { TanksModule } from './modules/tanks/tanks.module';
import { SensorsModule } from './modules/sensors/sensors.module';
import { ReadingsModule } from './modules/readings/readings.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { ReportsModule } from './modules/reports/reports.module';
import { IotGatewayModule } from './modules/iot-gateway/iot-gateway.module';
import { DevicesModule } from './modules/devices/devices.module';
import { TimescaleModule } from './modules/timescale/timescale.module';
import { PredictionsModule } from './modules/predictions/predictions.module';
import { GaugeReportModule } from './modules/gauge-report/gauge-report.module';
import { WebsocketModule } from './modules/websocket/websocket.module';
import { I18nModule } from './i18n/i18n.module';
import { LanguageMiddleware } from './i18n/language.middleware';

// Guards
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

// Config
import { databaseConfig } from './config/database.config';
import { jwtConfig } from './config/jwt.config';
import { resolve } from 'node:path';

@Module({
  imports: [
    // Configuração global
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env', resolve(__dirname, '../../.env')],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minuto
        limit: 100, // 100 requisições por minuto
      },
    ]),

    // Agendamento de tarefas
    ScheduleModule.forRoot(),

    // Banco de dados
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: databaseConfig,
      inject: [ConfigService],
    }),

    // Autenticação JWT
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: jwtConfig,
      inject: [ConfigService],
    }),

    // Passport
    PassportModule.register({ defaultStrategy: 'jwt' }),

    // Registra entidades globais
    TypeOrmModule.forFeature([User, Tank, Sensor, Reading, Alert]),

    // Módulos da aplicação
    I18nModule,
    AuthModule,
    TanksModule,
    SensorsModule,
    ReadingsModule,
    AlertsModule,
    ReportsModule,
    IotGatewayModule,
    DevicesModule,
    // Por último: configura TimescaleDB depois do synchronize do TypeORM
    TimescaleModule,
    PredictionsModule,
    GaugeReportModule,
    WebsocketModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DemoSeedService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Guards globais
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Resolve o idioma (Accept-Language) para todas as rotas da API
    consumer.apply(LanguageMiddleware).forRoutes('*');
  }
}
