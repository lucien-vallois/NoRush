/**
 * Estado de idioma sem dependências de DOM — importável em Node puro
 * (os testes unitários carregam utils/format.ts, que usa este módulo).
 * O i18n real (./index.ts) registra o tradutor e sincroniza a língua.
 */

const INTL_LOCALES: Record<string, string> = {
  en: "en-US",
  "pt-BR": "pt-BR",
  es: "es-ES",
};

let language = "en";
let translate: (key: string, vars?: Record<string, unknown>) => string = (
  key,
) => key;

export function setLanguage(lng: string): void {
  language = lng;
}

export function currentLanguage(): string {
  return language;
}

/** Locale Intl ativa (números/datas) — acompanha trocas de idioma */
export function currentLocale(): string {
  return INTL_LOCALES[language] ?? INTL_LOCALES.en;
}

/** Registrado pelo i18n no bootstrap; antes disso, devolve a própria chave */
export function registerTranslator(
  fn: (key: string, vars?: Record<string, unknown>) => string,
): void {
  translate = fn;
}

export function translateKey(
  key: string,
  vars?: Record<string, unknown>,
): string {
  return translate(key, vars);
}
