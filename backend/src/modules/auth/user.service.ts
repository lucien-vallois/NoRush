import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from '../../entities/user.entity';
import { CreateUserDto } from './auth.dto';

export interface UpdateUserDto {
  name?: string;
  email?: string;
  role?: UserRole;
  isActive?: boolean;
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { email, name, password, role = UserRole.OPERATOR } = createUserDto;

    // Verifica se o email já existe
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      throw new ConflictException({ code: 'emailAlreadyRegistered' });
    }

    // Hash da senha
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = this.userRepository.create({
      email,
      name,
      passwordHash,
      role,
    });

    const savedUser = await this.userRepository.save(user);
    this.logger.log(`Novo usuário criado: ${email} (${role})`);

    // Remove o hash da senha da resposta
    delete (savedUser as Partial<User>).passwordHash;
    return savedUser;
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      select: [
        'id',
        'email',
        'name',
        'role',
        'isActive',
        'lastLoginAt',
        'createdAt',
        'updatedAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'email',
        'name',
        'role',
        'isActive',
        'tokenVersion',
        'lastLoginAt',
        'createdAt',
        'updatedAt',
      ],
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    // Verifica se o email já está sendo usado por outro usuário
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.findByEmail(updateUserDto.email);
      if (existingUser) {
        throw new ConflictException({ code: 'emailAlreadyRegistered' });
      }
    }

    await this.userRepository.update(id, {
      ...updateUserDto,
      updatedAt: new Date(),
    });

    const updatedUser = await this.findById(id);
    if (!updatedUser) {
      throw new NotFoundException({ code: 'userNotFound' });
    }
    this.logger.log(`Usuário atualizado: ${updatedUser.email}`);

    return updatedUser;
  }

  async delete(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    await this.userRepository.delete(id);
    this.logger.log(`Usuário deletado: ${user.email}`);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, {
      lastLoginAt: new Date(),
    });
  }

  async incrementTokenVersion(id: string): Promise<void> {
    await this.userRepository.increment({ id }, 'tokenVersion', 1);
  }

  async validatePassword(
    email: string,
    password: string,
  ): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }

    // Remove o hash da senha da resposta
    delete (user as Partial<User>).passwordHash;
    return user;
  }

  async changePassword(
    id: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    // Verifica a senha atual
    const isOldPasswordValid = await bcrypt.compare(
      oldPassword,
      user.passwordHash,
    );
    if (!isOldPasswordValid) {
      throw new ConflictException('Senha atual incorreta');
    }

    // Hash da nova senha
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await this.userRepository.update(id, {
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    });

    this.logger.log(`Senha alterada para o usuário: ${user.email}`);
  }

  async getUsersByRole(role: UserRole): Promise<User[]> {
    return this.userRepository.find({
      where: { role, isActive: true },
      select: ['id', 'email', 'name', 'role', 'lastLoginAt', 'createdAt'],
      order: { name: 'ASC' },
    });
  }

  async deactivateUser(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    await this.userRepository.update(id, {
      isActive: false,
      updatedAt: new Date(),
    });

    this.logger.log(`Usuário desativado: ${user.email}`);
  }

  async activateUser(id: string): Promise<void> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException({ code: 'userNotFound' });
    }

    await this.userRepository.update(id, {
      isActive: true,
      updatedAt: new Date(),
    });

    this.logger.log(`Usuário ativado: ${user.email}`);
  }
}
