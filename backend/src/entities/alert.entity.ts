import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { NumericTransformer } from '../common/transformers/numeric.transformer';
import { Tank } from './tank.entity';
import { User } from './user.entity';
import { Sensor } from './sensor.entity';

export enum AlertType {
  HIGH_LEVEL = 'high_level',
  LOW_LEVEL = 'low_level',
  OVERFLOW_RISK = 'overflow_risk',
  SENSOR_OFFLINE = 'sensor_offline',
  BATTERY_LOW = 'battery_low',
  SENSOR_ERROR = 'sensor_error',
  MAINTENANCE_DUE = 'maintenance_due',
  CALIBRATION_DUE = 'calibration_due',
  COMMUNICATION_ERROR = 'communication_error',
  POWER_FAILURE = 'power_failure',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  FALSE_POSITIVE = 'false_positive',
}

@Entity('alerts')
@Index(['tankId', 'status'])
@Index(['type', 'status'])
@Index(['createdAt'])
export class Alert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  tankId: string;

  @ManyToOne(() => Tank, (tank) => tank.alerts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tankId' })
  tank: Tank;

  @Column({
    type: 'enum',
    enum: AlertType,
  })
  type: AlertType;

  @Column({
    type: 'enum',
    enum: AlertSeverity,
    default: AlertSeverity.MEDIUM,
  })
  severity: AlertSeverity;

  @Column({
    type: 'enum',
    enum: AlertStatus,
    default: AlertStatus.ACTIVE,
  })
  status: AlertStatus;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  // Dados relacionados ao alerta
  @Column('decimal', {
    precision: 6,
    scale: 3,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  currentLevel: number; // Nível atual em metros

  @Column('decimal', {
    precision: 10,
    scale: 3,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  currentVolume: number; // Volume atual em litros

  @Column('decimal', {
    precision: 6,
    scale: 3,
    nullable: true,
    transformer: new NumericTransformer(),
  })
  thresholdValue: number; // Valor do limite que foi atingido

  @Column({ nullable: true })
  sensorId: string; // ID do sensor que gerou o alerta

  @ManyToOne(() => Sensor, { nullable: true })
  @JoinColumn({ name: 'sensorId' })
  sensor: Sensor;

  // Metadados adicionais
  @Column('jsonb', { nullable: true })
  metadata: Record<string, any>;

  // Controle de resolução
  @Column({ nullable: true })
  resolvedAt: Date;

  @Column('uuid', { nullable: true })
  resolvedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'resolvedById' })
  resolvedBy: User;

  @Column({ nullable: true })
  resolutionNotes: string;

  // Controle de reconhecimento
  @Column({ nullable: true })
  acknowledgedAt: Date;

  @Column('uuid', { nullable: true })
  acknowledgedById: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'acknowledgedById' })
  acknowledgedBy: User;

  // Timestamps
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Métodos de instância
  isActive(): boolean {
    return this.status === AlertStatus.ACTIVE;
  }

  isResolved(): boolean {
    return this.status === AlertStatus.RESOLVED;
  }

  isAcknowledged(): boolean {
    return this.status === AlertStatus.ACKNOWLEDGED;
  }

  isCritical(): boolean {
    return this.severity === AlertSeverity.CRITICAL;
  }

  canBeResolvedBy(userRole: string): boolean {
    // Lógica de permissões baseada na severidade
    switch (this.severity) {
      case AlertSeverity.CRITICAL:
        return ['admin', 'operator'].includes(userRole);
      case AlertSeverity.HIGH:
        return ['admin', 'operator', 'maintenance'].includes(userRole);
      default:
        return true; // Todos podem resolver alertas de baixa severidade
    }
  }

  getAgeInMinutes(): number {
    const now = new Date();
    const created = new Date(this.createdAt);
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
  }

  getTimeToResolution(): number | null {
    if (!this.resolvedAt) return null;

    const created = new Date(this.createdAt);
    const resolved = new Date(this.resolvedAt);
    return Math.floor((resolved.getTime() - created.getTime()) / (1000 * 60));
  }

  shouldEscalate(): boolean {
    if (!this.isActive()) return false;

    const ageInMinutes = this.getAgeInMinutes();

    // Regras de escalação baseadas na severidade
    switch (this.severity) {
      case AlertSeverity.CRITICAL:
        return ageInMinutes > 15; // 15 minutos
      case AlertSeverity.HIGH:
        return ageInMinutes > 60; // 1 hora
      case AlertSeverity.MEDIUM:
        return ageInMinutes > 240; // 4 horas
      default:
        return ageInMinutes > 480; // 8 horas
    }
  }

  toNotificationPayload(): any {
    return {
      id: this.id,
      type: this.type,
      severity: this.severity,
      title: this.title,
      message: this.message,
      tankId: this.tankId,
      tankName: this.tank?.name,
      currentLevel: this.currentLevel,
      thresholdValue: this.thresholdValue,
      createdAt: this.createdAt,
      isCritical: this.isCritical(),
    };
  }
}
