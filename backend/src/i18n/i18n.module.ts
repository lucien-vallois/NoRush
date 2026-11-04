import { Global, Module } from '@nestjs/common';
import { I18nService } from './i18n.service';

/**
 * i18n do backend: catálogos en/pt-BR/es (base en) + resolução de
 * Accept-Language + tradução de exceções e de mensagens de alerta na borda
 * da API. Global: qualquer módulo injeta I18nService sem importá-lo.
 */
@Global()
@Module({
  providers: [I18nService],
  exports: [I18nService],
})
export class I18nModule {}
