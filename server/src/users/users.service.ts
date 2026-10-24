import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { compare, hash } from 'bcryptjs';
import { Model, Types } from 'mongoose';

import { UpdateUserDto } from './dto/update-user.dto.js';
import {
  DEFAULT_STORAGE_QUOTA,
  User,
  type UserDocument,
  UserRole,
} from './schemas/user.schema.js';

/** Resumen de cuota de almacenamiento de un usuario. */
export interface StorageSummary {
  quota: number;
  used: number;
  available: number;
}

/** Datos mínimos para crear un usuario. El rol nunca viene del cliente. */
export interface CreateUserData {
  email: string;
  name: string;
  password: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  /**
   * Crea un usuario con rol USER y la contraseña cifrada con bcrypt.
   * El registro público nunca puede elegir rol.
   */
  async createUser(data: CreateUserData): Promise<Record<string, unknown>> {
    const email = data.email.trim().toLowerCase();

    // Comprobación temprana para devolver un 409 claro; el índice único de
    // `email` sigue siendo la garantía real ante condiciones de carrera.
    const exists = await this.userModel.exists({ email });
    if (exists) {
      throw new ConflictException('El email ya está registrado');
    }

    try {
      const created = await this.userModel.create({
        email,
        name: data.name.trim(),
        // Nunca se guarda la contraseña en texto plano.
        passwordHash: await hash(data.password, 10),
        role: UserRole.USER,
      });
      return this.toPublic(created);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('El email ya está registrado');
      }
      throw error;
    }
  }

  /**
   * Busca por email. El login debe usar `withPassword: true` para traer
   * `passwordHash`, que por defecto tiene `select: false`.
   */
  async findByEmail(
    email: string,
    withPassword = false,
  ): Promise<UserDocument | null> {
    const query = this.userModel.findOne({ email: email.trim().toLowerCase() });
    if (withPassword) {
      query.select('+passwordHash');
    }
    return query.exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return this.userModel.findById(id).exec();
  }

  /**
   * Resumen de almacenamiento del usuario autenticado.
   * `available` nunca es negativo: si la cuota se redujo por debajo de lo ya
   * usado (situación transitoria), el cliente ve 0 bytes disponibles.
   */
  async getStorage(userId: string): Promise<StorageSummary> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const quota = user.storageQuota ?? DEFAULT_STORAGE_QUOTA;
    const used = user.storageUsed ?? 0;

    return {
      quota,
      used,
      available: Math.max(quota - used, 0),
    };
  }

  /** Listado administrativo de usuarios. */
  async findAll(): Promise<Record<string, unknown>[]> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).exec();
    return users.map((user) => this.toPublic(user));
  }

  /**
   * Actualiza rol, estado y/o cuota. Solo se invoca desde rutas de ADMIN.
   * Desactivar no borra al usuario ni su historial: solo impide el login.
   */
  async update(
    id: string,
    dto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const user = await this.userModel.findById(id).exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (dto.role !== undefined) {
      user.role = dto.role;
    }
    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;
    }
    if (dto.storageQuota !== undefined) {
      // La cuota no puede dejar al usuario por debajo de lo que ya ocupa.
      // El DTO ya garantiza que sea un entero positivo.
      if (dto.storageQuota < (user.storageUsed ?? 0)) {
        throw new BadRequestException(
          `La cuota no puede ser menor que el espacio ya usado (${user.storageUsed ?? 0} bytes)`,
        );
      }
      user.storageQuota = dto.storageQuota;
    }

    await user.save();
    return this.toPublic(user);
  }

  /** Compara una contraseña en claro con el hash almacenado. */
  verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }

  /**
   * Convierte el documento en un objeto plano seguro para la API.
   * Elimina `passwordHash` aunque el documento lo haya traído seleccionado
   * explícitamente (el login lo necesita, la respuesta nunca).
   */
  toPublic(user: UserDocument): Record<string, unknown> {
    const plain = user.toObject() as unknown as Record<string, unknown>;
    delete plain.passwordHash;

    // Compatibilidad con usuarios creados antes de existir `storageQuota`:
    // aunque Mongoose aplica el default al hidratar, la respuesta pública
    // siempre expone un valor concreto.
    if (plain.storageQuota === undefined || plain.storageQuota === null) {
      plain.storageQuota = DEFAULT_STORAGE_QUOTA;
    }

    return plain;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
