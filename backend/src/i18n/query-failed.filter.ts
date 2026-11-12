import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { I18nService } from './i18n.service';
import { REQUEST_LANG_KEY } from './language.middleware';

/** PostgreSQL: a value that cannot be read as the column type (e.g. a uuid). */
const INVALID_TEXT_REPRESENTATION = '22P02';

/**
 * Database errors that reach the HTTP layer. A malformed identifier in the
 * URL (`/sensors/not-a-uuid`) is the client's mistake: 400 with a translated
 * message instead of a 500. Anything else stays a 500 and never exposes the
 * SQL or the driver message.
 */
@Catch(QueryFailedError)
export class QueryFailedFilter implements ExceptionFilter {
  private readonly logger = new Logger(QueryFailedFilter.name);

  constructor(private readonly i18n: I18nService) {}

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const driverCode = (exception.driverError as { code?: string } | undefined)
      ?.code;

    if (driverCode === INVALID_TEXT_REPRESENTATION) {
      const lang = (request[REQUEST_LANG_KEY] as string) ?? 'en';
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: this.i18n.translate(lang, 'exceptions.invalidIdentifier'),
        code: 'invalidIdentifier',
        error: 'Bad Request',
      });
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} failed in the database`,
      exception.stack,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
