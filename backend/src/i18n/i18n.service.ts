import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import i18next, { TFunction } from 'i18next';
import { Alert, AlertType } from '../entities/alert.entity';
import en from './locales/en.json';
import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';

export const SUPPORTED_LANGUAGES = ['en', 'pt-BR', 'es'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

/** Locale Intl por idioma (decimais 2.5 / 2,5) */
const INTL_LOCALES: Record<AppLanguage, string> = {
  en: 'en-US',
  'pt-BR': 'pt-BR',
  es: 'es-ES',
};

/** Normaliza qualquer código recebido no Accept-Language p/ as línguas suportadas */
export function normalizeLanguage(raw: string | undefined | null): AppLanguage {
  if (!raw) return DEFAULT_LANGUAGE;
  const code = raw.trim().toLowerCase();
  if (code.startsWith('pt')) return 'pt-BR';
  if (code.startsWith('es')) return 'es';
  if (code.startsWith('en')) return 'en';
  return DEFAULT_LANGUAGE;
}

@Injectable()
export class I18nService implements OnModuleInit {
  private readonly logger = new Logger(I18nService.name);
  private t!: TFunction;

  async onModuleInit(): Promise<void> {
    this.t = await i18next.init({
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'translation',
      resources: {
        en: { translation: en },
        'pt-BR': { translation: ptBR },
        es: { translation: es },
      },
      interpolation: { escapeValue: false },
    });
    this.logger.log(`i18n pronto (en, pt-BR, es; base = ${DEFAULT_LANGUAGE})`);
  }

  /** Traduz uma chave no idioma pedido; params interpolam como {{nome}} */
  translate(
    lang: string | undefined,
    key: string,
    params?: Record<string, unknown>,
  ): string {
    const lng = normalizeLanguage(lang);
    const result = this.t(key, { lng, ...params });
    // Chave ausente no catálogo → devolve a própria chave (sinal claro de gap)
    return result === key ? key : result;
  }

  /** Número formatado no idioma pedido (separador decimal localizado) */
  formatNumber(lang: string | undefined, value: number, digits = 2): string {
    return value.toLocaleString(INTL_LOCALES[normalizeLanguage(lang)], {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  /**
   * Recompõe título/mensagem do alerta no idioma pedido a partir do
   * `type` + parâmetros — o texto persistido fica como fallback/auditoria,
   * então alertas históricos também são traduzidos na borda.
   * `units` converte nível/ritmo na borda (o armazenamento segue métrico).
   */
  localizeAlert(
    alert: Alert,
    lang: string | undefined,
    units: 'metric' | 'imperial' = 'metric',
  ): { title: string; message: string } {
    const type = alert.type as AlertType;
    const base = `alertTypes.${type}`;
    const hasType = this.t(`${base}.title`, { lng: DEFAULT_LANGUAGE }) !== `${base}.title`;

    if (!hasType) {
      // Tipo fora do catálogo: devolve o texto persistido
      return { title: alert.title, message: alert.message };
    }

    const FT_PER_M = 1 / 0.3048;
    const imperial = units === 'imperial';
    const levelUnit = imperial ? 'ft' : 'm';
    const rateUnit = imperial ? 'ft/h' : 'm/h';

    const fmtMeters = (v: number | null | undefined): string => {
      if (v == null) return this.translate(lang, 'exceptions.unknownLevel');
      const value = Number(v) * (imperial ? FT_PER_M : 1);
      // ft usa 1 casa (1 ft ≈ 3× a resolução do metro); m mantém 2
      return this.formatNumber(lang, value, imperial ? 1 : 2);
    };

    if (type === AlertType.OVERFLOW_RISK && alert.metadata?.predictive) {
      const rate =
        Number(alert.metadata.fillRateMH ?? 0) * (imperial ? FT_PER_M : 1);
      return {
        title: this.translate(lang, `${base}.predictiveTitle`),
        message: this.translate(lang, `${base}.predictiveMessage`, {
          tank: alert.tank?.code ?? alert.tankId.slice(0, 8),
          eta: this.formatEtaHours(lang, Number(alert.metadata.etaHours)),
          rate: this.formatNumber(lang, rate, 3),
          rateUnit,
          confidence: Math.round(Number(alert.metadata.confidence ?? 0) * 100),
        }),
      };
    }

    return {
      title: this.translate(lang, `${base}.title`),
      message: this.translate(lang, `${base}.message`, {
        level: fmtMeters(alert.currentLevel),
        threshold: fmtMeters(alert.thresholdValue),
        levelUnit,
      }),
    };
  }

  /** "2h05" / "45min" — formato compacto igual nas três línguas */
  private formatEtaHours(lang: string | undefined, hours: number | undefined): string {
    if (hours == null || !Number.isFinite(hours)) return '—';
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}min`;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 60) return `${h + 1}h00`;
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  }
}
