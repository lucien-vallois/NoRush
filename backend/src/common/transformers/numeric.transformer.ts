import { ValueTransformer } from 'typeorm';

/**
 * O driver do Postgres retorna colunas numeric/decimal como string.
 * A API (e o frontend) esperam números — o transformer converte na leitura,
 * mantendo null como null. Aplicado em todas as colunas decimais das entidades.
 */
export class NumericTransformer implements ValueTransformer {
  to(value: number | null): number | null {
    return value;
  }

  from(value: string | null): number | null {
    if (value === null || value === undefined) return null;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
}
