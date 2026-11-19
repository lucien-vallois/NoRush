import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Sensor } from './sensor.entity';

export interface OilWaterInterface {
  oilLevel: number; // Nível da interface óleo em metros
  waterLevel: number; // Nível da água em metros
  interfaceLevel: number; // Nível da interface óleo-água em metros
}

export interface ReadingMetadata {
  signalStrength?: number; // Intensidade do sinal
  temperature?: number; // Temperatura ambiente em °C
  humidity?: number; // Umidade relativa em %
  pressure?: number; // Pressão atmosférica em hPa
  rawData?: any; // Dados brutos do sensor
  processingTime?: number; // Tempo de processamento em ms
  anomaly?: boolean; // Leitura marcada como anômala (z-score > 3)
  zScore?: number; // Z-score que disparou a marcação de anomalia
}

@Entity('readings')
@Index(['sensorId', 'timestamp'])
@Index(['timestamp'])
@Index(
  'UQ_readings_sensor_message_timestamp',
  ['sensorId', 'messageId', 'timestamp'],
  {
    unique: true,
  },
)
export class Reading {
  // PK composta (id, timestamp) — exigência do TimescaleDB: índices únicos em
  // hypertable precisam incluir a coluna de particionamento. O id segue único
  // na prática (uuid v4 gerado pela aplicação nos pontos de inserção).
  @PrimaryColumn('uuid')
  id: string;

  @Column('uuid')
  sensorId: string;

  @Column('uuid', { nullable: true })
  messageId?: string;

  @ManyToOne(() => Sensor, (sensor) => sensor.readings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sensorId' })
  sensor: Sensor;

  // Dados de medição primários
  @Column('decimal', {
    precision: 6,
    scale: 3,
    transformer: new NumericTransformer(),
  })
  level: number; // Nível em metros

  @Column('decimal', {
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  volume: number; // Volume calculado em litros

  // Interface óleo-água (se aplicável)
  @Column('jsonb', { nullable: true })
  oilWaterInterface: OilWaterInterface;

  // Metadados da leitura
  @Column('jsonb', { nullable: true })
  metadata: ReadingMetadata;

  // Qualidade da medição
  @Column('decimal', {
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  quality: number; // Qualidade da medição (0-100%)

  @Column({ default: false })
  isCalibrated: boolean; // Indica se a leitura foi calibrada

  @Column({ default: false })
  isProcessed: boolean; // Indica se a leitura foi processada

  // Timestamp da leitura (parte da PK — particionamento da hypertable)
  @PrimaryColumn({ type: 'timestamp with time zone' })
  timestamp: Date;

  // Timestamp de processamento
  @Column({ type: 'timestamp with time zone', nullable: true })
  processedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  // Métodos de instância
  getLevelInCm(): number {
    return Math.round(this.level * 100);
  }

  getVolumeInCubicMeters(): number {
    return this.volume ? this.volume / 1000 : 0;
  }

  hasOilWaterInterface(): boolean {
    return !!this.oilWaterInterface;
  }

  getOilLevel(): number {
    return this.oilWaterInterface?.oilLevel || 0;
  }

  getWaterLevel(): number {
    return this.oilWaterInterface?.waterLevel || 0;
  }

  getInterfaceLevel(): number {
    return this.oilWaterInterface?.interfaceLevel || 0;
  }

  getOilVolume(): number {
    if (!this.oilWaterInterface || !this.volume) return 0;

    const totalHeight = this.level;
    const oilHeight = this.oilWaterInterface.oilLevel;

    if (totalHeight === 0) return 0;

    return (oilHeight / totalHeight) * this.volume;
  }

  getWaterVolume(): number {
    if (!this.oilWaterInterface || !this.volume) return 0;

    const totalHeight = this.level;
    const waterHeight = this.oilWaterInterface.waterLevel;

    if (totalHeight === 0) return 0;

    return (waterHeight / totalHeight) * this.volume;
  }

  isValid(): boolean {
    return (
      this.level >= 0 &&
      (!this.volume || this.volume >= 0) &&
      (!this.quality || (this.quality >= 0 && this.quality <= 100))
    );
  }

  getTimeSinceReading(): number {
    return Date.now() - this.timestamp.getTime();
  }

  isRecent(maxAgeMinutes: number = 5): boolean {
    const maxAge = maxAgeMinutes * 60 * 1000;
    return this.getTimeSinceReading() <= maxAge;
  }
}
