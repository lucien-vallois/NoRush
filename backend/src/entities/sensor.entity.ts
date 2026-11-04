import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Tank } from './tank.entity';
import { Reading } from './reading.entity';

export enum SensorType {
  /** Haste magnetostritiva de duas boias: nível total + interface óleo/água */
  MAGNETOSTRICTIVE = 'magnetostrictive',
  RADAR_LEVEL = 'radar_level',
  FLOAT_SWITCH = 'float_switch',
  ULTRASONIC = 'ultrasonic',
  PRESSURE = 'pressure',
  CAPACITIVE = 'capacitive',
}

export enum SensorProtocol {
  MQTT = 'mqtt',
  HTTP = 'http',
  MODBUS = 'modbus',
  LORAWAN = 'lorawan',
}

export enum SensorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  MAINTENANCE = 'maintenance',
  ERROR = 'error',
  OFFLINE = 'offline',
}

@Entity('sensors')
export class Sensor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sensorId: string; // ID único do sensor físico

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: SensorType,
    default: SensorType.MAGNETOSTRICTIVE,
  })
  type: SensorType;

  @Column({
    type: 'enum',
    enum: SensorProtocol,
    default: SensorProtocol.MQTT,
  })
  protocol: SensorProtocol;

  @Column({ nullable: true })
  model: string;

  @Column({ nullable: true })
  manufacturer: string;

  @Column({ nullable: true })
  firmwareVersion: string;

  @Column('uuid')
  tankId: string;

  @ManyToOne(() => Tank, tank => tank.sensors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tankId' })
  tank: Tank;

  @Column({
    type: 'enum',
    enum: SensorStatus,
    default: SensorStatus.ACTIVE,
  })
  status: SensorStatus;

  // Configurações elétricas
  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  batteryLevel: number; // Nível de bateria em porcentagem (0-100)

  @Column({ nullable: true })
  batteryLastUpdate: Date;

  @Column('decimal', { precision: 6, scale: 2, nullable: true, transformer: new NumericTransformer() })
  powerVoltage: number; // Tensão de alimentação em volts

  // Configurações de medição
  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  measurementRangeMin: number; // Faixa de medição mínima em metros

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: new NumericTransformer() })
  measurementRangeMax: number; // Faixa de medição máxima em metros

  @Column('decimal', { precision: 4, scale: 2, nullable: true, transformer: new NumericTransformer() })
  accuracy: number; // Precisão em metros ou porcentagem

  // Status de conectividade
  @Column({ nullable: true })
  lastTransmissionAt: Date;

  @Column({ default: 0 })
  transmissionCount: number;

  @Column({ default: 0 })
  errorCount: number;

  @Column({ nullable: true })
  lastErrorAt: Date;

  @Column({ nullable: true })
  lastErrorMessage: string;

  // Configurações específicas do sensor
  @Column('jsonb', { nullable: true })
  configuration: Record<string, any>; // Configurações específicas do sensor

  // Credencial de ingestão por dispositivo (provisionamento via /devices).
  // select:false mantém o hash fora de SELECTs padrão e das respostas da API;
  // quem autentica pede explicitamente via addSelect.
  @Column({ nullable: true, select: false })
  credentialHash: string; // sha256 (hex) do secret do dispositivo

  @Column({ default: 0 })
  credentialVersion: number;

  @Column({ nullable: true })
  credentialRotatedAt: Date;

  @Column({ nullable: true })
  installationDate: Date;

  @Column({ nullable: true })
  calibrationDate: Date;

  @Column({ nullable: true })
  nextCalibrationDate: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relacionamentos
  @OneToMany(() => Reading, reading => reading.sensor)
  readings: Reading[];

  // Métodos de instância
  isOnline(): boolean {
    if (!this.lastTransmissionAt) return false;

    const now = new Date();
    const timeDiff = now.getTime() - this.lastTransmissionAt.getTime();
    const fiveMinutes = 5 * 60 * 1000; // 5 minutos em milissegundos

    return timeDiff < fiveMinutes;
  }

  needsCalibration(): boolean {
    if (!this.nextCalibrationDate) return false;
    return new Date() >= this.nextCalibrationDate;
  }

  getBatteryStatus(): 'good' | 'warning' | 'critical' {
    if (!this.batteryLevel) return 'warning';

    if (this.batteryLevel >= 20) return 'good';
    if (this.batteryLevel >= 10) return 'warning';
    return 'critical';
  }

  updateTransmissionStats(success: boolean, errorMessage?: string): void {
    this.lastTransmissionAt = new Date();
    this.transmissionCount++;

    if (!success) {
      this.errorCount++;
      this.lastErrorAt = new Date();
      if (errorMessage) {
        this.lastErrorMessage = errorMessage;
      }
    }
  }

  updateBatteryLevel(level: number): void {
    this.batteryLevel = level;
    this.batteryLastUpdate = new Date();
  }
}
