import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import {
  normalizeLanguage,
  AppLanguage,
  DEFAULT_LANGUAGE,
} from './i18n.service';

export const REQUEST_LANG_KEY = 'norushLang';

/**
 * Resolve o idioma do request a partir do header Accept-Language
 * (padrão HTTP com q-values, ex.: "en-US,en;q=0.9,pt-BR;q=0.8").
 * O resultado normalizado fica em request.norushLang; sem header → inglês.
 */
@Injectable()
export class LanguageMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    req[REQUEST_LANG_KEY] = resolveAcceptLanguage(
      req.headers['accept-language'],
    );
    res.setHeader('Content-Language', req[REQUEST_LANG_KEY]);
    next();
  }
}

/** Extrai a melhor língua suportada segundo os q-values do header */
export function resolveAcceptLanguage(header: string | undefined): AppLanguage {
  if (!header) return DEFAULT_LANGUAGE;

  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: tag.trim(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((c) => c.tag && c.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const candidate of candidates) {
    const lower = candidate.tag.toLowerCase();
    if (
      lower.startsWith('pt') ||
      lower.startsWith('es') ||
      lower.startsWith('en')
    ) {
      return normalizeLanguage(lower);
    }
  }
  return DEFAULT_LANGUAGE;
}
