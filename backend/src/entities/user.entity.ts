import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Exclude } from 'class-transformer';

export enum UserRole {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  MAINTENANCE = 'maintenance',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 255 })
  @Exclude()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.OPERATOR,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastLoginAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Métodos de instância
  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  isOperator(): boolean {
    return this.role === UserRole.OPERATOR || this.role === UserRole.ADMIN;
  }

  isMaintenance(): boolean {
    return this.role === UserRole.MAINTENANCE || this.role === UserRole.ADMIN;
  }
}
