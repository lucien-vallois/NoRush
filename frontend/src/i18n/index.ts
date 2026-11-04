import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ptBR from "./locales/pt-BR.json";
import es from "./locales/es.json";
import {
  currentLocale,
  registerTranslator,
  setLanguage,
} from "./language";

export { currentLocale };
export const SUPPORTED_LANGUAGES = ["en", "pt-BR", "es"] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "norush.language";

/** Metadados exibidos no seletor de idioma */
export const LANGUAGES: {
  code: AppLanguage;
  label: string;
  short: string;
}[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "pt-BR", label: "Português (BR)", short: "PT" },
  { code: "es", label: "Español", short: "ES" },
];

function isSupported(value: string | null): value is AppLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Inglês é a base: primeira visita abre em EN; a escolha fica em localStorage */
const stored =
  typeof localStorage !== "undefined"
    ? localStorage.getItem(LANGUAGE_STORAGE_KEY)
    : null;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "pt-BR": { translation: ptBR },
    es: { translation: es },
  },
  lng: isSupported(stored) ? stored : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false }, // React já protege contra XSS
});

// Ponte i18n → módulo puro de formato (utils/format.ts e afins)
registerTranslator((key, vars) => i18n.t(key, vars));
setLanguage(i18n.language);

function applyDocumentState(lng: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng;
  document.title = i18n.t("app.title");
}

i18n.on("languageChanged", (lng) => {
  if (isSupported(lng) && typeof localStorage !== "undefined") {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng);
  }
  setLanguage(lng);
  applyDocumentState(lng);
});

// Estado inicial do documento (o evento acima só dispara em mudanças)
applyDocumentState(i18n.language);

export default i18n;
