import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { type HydratedDocument } from 'mongoose';

/** Roles válidos del sistema. */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

/**
 * Cuota de almacenamiento por defecto: 50 MB.
 * Los usuarios creados antes de existir `storageQuota` se interpretan con este
 * valor, tanto al hidratarlos con Mongoose como en las validaciones de subida.
 */
export const DEFAULT_STORAGE_QUOTA = 50 * 1024 * 1024;

/**
 * Colección `users`.
 *
 * Responsabilidad: identidad, credenciales, rol, estado y contabilidad de
 * almacenamiento. No embebe archivos ni carpetas: esas relaciones se resuelven
 * desde `files` y `folders` mediante `ownerId`.
 */
@Schema({
  collection: 'users',
  timestamps: true,
  versionKey: false,
})
export class User {
  /**
   * Login único. Se normaliza a minúsculas y sin espacios para que la
   * unicidad del índice sea efectiva.
   */
  @Prop({ required: true, lowercase: true, trim: true })
  email: string;

  /**
   * Hash bcrypt de la contraseña. `select: false` evita que se devuelva por
   * accidente en consultas y respuestas de la API.
   */
  @Prop({ required: true, select: false })
  passwordHash: string;

  /** Nombre visible del usuario. */
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({
    required: true,
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
  })
  role: UserRole;

  /**
   * Invariante: desactivar un usuario no borra sus recursos ni su historial.
   * Simplemente se impide el login en la capa de autenticación.
   */
  @Prop({ required: true, default: true })
  isActive: boolean;

  /**
   * Bytes ocupados por el usuario. Incluye los archivos en papelera; solo se
   * decrementa al purgar definitivamente un archivo.
   *
   * Invariante (se mantiene en la capa de servicio): debe coincidir con la
   * suma de `files.size` de todos los archivos del usuario aún no purgados.
   */
  @Prop({ required: true, default: 0, min: 0 })
  storageUsed: number;

  /**
   * Cuota máxima de almacenamiento en bytes. Por defecto 50 MB.
   *
   * Invariante (se mantiene en la capa de servicio): debe ser un entero
   * positivo y nunca menor que `storageUsed`.
   */
  @Prop({ required: true, default: DEFAULT_STORAGE_QUOTA, min: 1 })
  storageQuota: number;

  /** Último login correcto; `null` si nunca ha iniciado sesión. */
  @Prop({ type: Date, default: null })
  lastLoginAt: Date | null;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

// Único: login y prevención de cuentas duplicadas.
UserSchema.index({ email: 1 }, { unique: true });

// Compuesto: listado administrativo por rol/estado, ordenado por alta.
UserSchema.index({ role: 1, isActive: 1, createdAt: -1 });
