import type {
  TankArqueacao,
  TankDimensions,
} from '../../entities/tank.entity';

/**
 * Regras de consistência de um tanque cadastrado pelo operador. Tudo em
 * metros e litros (a API é métrica; o console converte na borda).
 */
export interface TankConfigInput {
  dimensions?: Partial<TankDimensions> | null;
  arqueacaoTable?: TankArqueacao[] | null;
  minLevelThreshold?: number | null;
  lowLevelThreshold?: number | null;
  maxLevelThreshold?: number | null;
  overflowThreshold?: number | null;
}

/** Código de exceção localizável (`exceptions.<code>`) ou null se válido. */
export type TankConfigError =
  | 'tankDimensionsInvalid'
  | 'strappingTableInvalid'
  | 'tankThresholdsOrder'
  | 'tankThresholdAboveHeight';

/** Folga de arredondamento (ft↔m) ao comparar com a altura: 1 cm */
const HEIGHT_TOLERANCE_M = 0.01;

const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);

export function validateTankConfig(input: TankConfigInput): TankConfigError | null {
  const height = input.dimensions?.height;
  const diameter = input.dimensions?.diameter;
  if (!finite(height) || height <= 0 || !finite(diameter) || diameter <= 0) {
    return 'tankDimensionsInvalid';
  }

  const table = input.arqueacaoTable;
  if (table && table.length > 0) {
    if (table.length < 2) return 'strappingTableInvalid';
    for (let i = 0; i < table.length; i++) {
      const { level, volume } = table[i];
      if (!finite(level) || !finite(volume) || level < 0 || volume < 0) {
        return 'strappingTableInvalid';
      }
      if (level > height + HEIGHT_TOLERANCE_M) return 'strappingTableInvalid';
      if (i > 0) {
        // nível estritamente crescente; volume nunca diminui
        if (level <= table[i - 1].level) return 'strappingTableInvalid';
        if (volume < table[i - 1].volume) return 'strappingTableInvalid';
      }
    }
  }

  // Ordem física dos limites: mínimo ≤ baixo < alto ≤ transbordo ≤ altura
  const ordered = [
    input.minLevelThreshold,
    input.lowLevelThreshold,
    input.maxLevelThreshold,
    input.overflowThreshold,
  ].filter(finite);
  for (const v of ordered) {
    if (v > height + HEIGHT_TOLERANCE_M) return 'tankThresholdAboveHeight';
  }
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] < ordered[i - 1]) return 'tankThresholdsOrder';
  }
  const low = input.lowLevelThreshold;
  const max = input.maxLevelThreshold;
  if (finite(low) && finite(max) && low >= max) return 'tankThresholdsOrder';

  return null;
}

/**
 * Capacidade nominal em litros: último ponto da tabela de arqueação quando
 * houver; senão cilindro vertical (π·r²·h).
 */
export function nominalVolumeLiters(
  dimensions: Pick<TankDimensions, 'height' | 'diameter'>,
  table?: TankArqueacao[] | null,
): number {
  if (table && table.length > 0) {
    return Math.round(table[table.length - 1].volume);
  }
  const r = dimensions.diameter / 2;
  return Math.round(Math.PI * r * r * dimensions.height * 1000);
}
