import { NestFactory } from '@nestjs/core';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { I18nService } from './i18n/i18n.service';
import { I18nHttpExceptionFilter } from './i18n/i18n-http-exception.filter';
import helmet from 'helmet';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.enableShutdownHooks();

  // Exceções com payload { code, ...params } saem traduzidas no Accept-Language
  app.useGlobalFilters(
    new I18nHttpExceptionFilter(app.get(I18nService)),
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
bootstrap();
