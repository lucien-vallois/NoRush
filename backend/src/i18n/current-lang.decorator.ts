import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { REQUEST_LANG_KEY } from './language.middleware';

/**
 * Injeta o idioma do request (resolvido do Accept-Language pelo
 * LanguageMiddleware) como parâmetro do handler.
 *
 *   async findAll(@CurrentLang() lang: string) { ... }
 */
export const CurrentLang = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request[REQUEST_LANG_KEY] as string) ?? 'en';
  },
);
