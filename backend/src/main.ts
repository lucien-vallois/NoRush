import { NestFactory } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { I18nService } from './i18n/i18n.service';
import { I18nHttpExceptionFilter } from './i18n/i18n-http-exception.filter';
import { QueryFailedFilter } from './i18n/query-failed.filter';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Behind a reverse proxy (Railway, nginx) the client IP arrives in
  // X-Forwarded-For; without this the rate limit sees every visitor as the
  // proxy. Off when the API is exposed directly, where that header could be
  // forged to dodge the limit. TRUST_PROXY = number of proxy hops.
  const trustProxy =
    process.env.TRUST_PROXY ??
    (process.env.RAILWAY_ENVIRONMENT ? '1' : undefined);
  if (trustProxy) {
    app.set(
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy === 'true',
    );
  }
  app.use(helmet());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  // Exceções com payload { code, ...params } saem traduzidas no Accept-Language
  app.useGlobalFilters(
    new I18nHttpExceptionFilter(app.get(I18nService)),
    new QueryFailedFilter(app.get(I18nService)),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
    credentials: true,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('NoRush Operations API')
      .setDescription(
        'Flowback tank monitoring. Demonstration environment with simulated telemetry.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT ?? process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `NoRush Operations API: http://localhost:${port}/api/docs`,
  );
}
bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('API failed to start', error);
  process.exit(1);
});
