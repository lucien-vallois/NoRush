import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Sensor } from './sensor.entity';
import { Alert } from './alert.entity';

export enum TankStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
  ERROR = 'error',
}

export interface TankDimensions {
  height: number; // Altura total do tanque em metros
  diameter: number; // Diâmetro do tanque em metros
  volume: number; // Volume total em litros
}

export interface TankArqueacao {
  level: number; // Nível em metros
  volume: number; // Volume correspondente em litros
}

@Entity('tanks')
export class Tank {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  code: string; // Código identificador único do tanque

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column('jsonb')
  dimensions: TankDimensions;

  @Column('jsonb', { nullable: true })
  arqueacaoTable: TankArqueacao[]; // Tabela de arqueação para conversão nível-volume

  @Column('decimal', { precision: 10, scale: 8, transformer: new NumericTransformer() })
  latitude: number;

  @Column('decimal', { precision: 11, scale: 8, transformer: new NumericTransformer() })
  longitude: number;

  @Column({
    type: 'enum',
    enum: TankStatus,
    default: TankStatus.ACTIVE,
  })
  status: TankStatus;

  // Limites de alerta
  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  maxLevelThreshold: number; // Nível máximo em metros

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  minLevelThreshold: number; // Nível mínimo em metros

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  overflowThreshold: number; // Limite de transbordo em metros

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  lowLevelThreshold: number; // Limite de nível baixo em metros

  @Column({ nullable: true })
  installationDate: Date;

  @Column({ nullable: true })
  lastMaintenanceDate: Date;

  @Column({ nullable: true })
  nextMaintenanceDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relacionamentos
  @OneToMany(() => Sensor, sensor => sensor.tank)
  sensors: Sensor[];

  @OneToMany(() => Alert, alert => alert.tank)
  alerts: Alert[];

  // Métodos de instância
  getCurrentLocation(): { latitude: number; longitude: number } {
    return {
      latitude: parseFloat(this.latitude.toString()),
      longitude: parseFloat(this.longitude.toString()),
    };
  }

  getVolumeFromLevel(level: number): number {
    if (!this.arqueacaoTable || this.arqueacaoTable.length === 0) {
      // Cálculo aproximado usando geometria do tanque (cilindro)
      const radius = this.dimensions.diameter / 2;
      const area = Math.PI * radius * radius;
      return area * level * 1000; // Volume em litros
    }

    // Interpolação linear na tabela de arqueação
    const sortedTable = this.arqueacaoTable.sort((a, b) => a.level - b.level);

    // Encontrar pontos de interpolação
    for (let i = 0; i < sortedTable.length - 1; i++) {
      const current = sortedTable[i];
      const next = sortedTable[i + 1];

      if (level >= current.level && level <= next.level) {
        // Interpolação linear
        const ratio = (level - current.level) / (next.level - current.level);
        return current.volume + ratio * (next.volume - current.volume);
      }
    }

    // Se nível estiver fora da tabela, usar o valor mais próximo
    if (level < sortedTable[0].level) return sortedTable[0].volume;
    if (level > sortedTable[sortedTable.length - 1].level) return sortedTable[sortedTable.length - 1].volume;

    return 0;
  }

  isAtRisk(level: number): boolean {
    return Boolean(
      (this.maxLevelThreshold && level >= this.maxLevelThreshold) ||
      (this.minLevelThreshold && level <= this.minLevelThreshold) ||
      (this.overflowThreshold && level >= this.overflowThreshold) ||
      (this.lowLevelThreshold && level <= this.lowLevelThreshold)
    );
  }
}
