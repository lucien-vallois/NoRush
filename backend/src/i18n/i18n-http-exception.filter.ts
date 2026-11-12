import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { I18nService } from './i18n.service';
import { REQUEST_LANG_KEY } from './language.middleware';

interface LocalizedErrorBody {
  code: string;
  [param: string]: unknown;
}

/**
 * Traduz exceções HTTP cujo payload foi construído como
 * `new HttpException({ code: 'chaveI18n', ...params }, status)` para o
 * idioma do request. Exceções com payload tradicional (string do próprio
 * serviço, erros de validação do pipe) passam intactas.
 */
@Catch(HttpException)
export class I18nHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nHttpExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const body = exception.getResponse() as
      | string
      | LocalizedErrorBody
      | { message: string | string[]; error: string; statusCode: number };

    // Payload localizável: { code, ...params }
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as LocalizedErrorBody).code === 'string'
    ) {
      const { code, ...params } = body as LocalizedErrorBody;
      const lang = (request[REQUEST_LANG_KEY] as string) ?? 'en';
      const message = this.i18n.translate(lang, `exceptions.${code}`, params);

      response.status(status).json({
        statusCode: status,
        message,
        code,
        error: HttpStatus[status] ?? exception.name,
      });
      return;
    }

    // Payload tradicional: devolve a resposta original do Nest
    response
      .status(status)
      .json(
        typeof body === 'string' ? { statusCode: status, message: body } : body,
      );
  }
}
