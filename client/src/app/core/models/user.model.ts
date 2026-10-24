/** Roles válidos del sistema, iguales a los del backend. */
export type UserRole = 'ADMIN' | 'USER';

/** Documento público de `users`: la API nunca devuelve `passwordHash`. */
export interface User {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  /** Bytes ocupados; incluye los archivos que están en la papelera. */
  storageUsed: number;
  /** Cuota de almacenamiento en bytes (50 MB por defecto). */
  storageQuota: number;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Cambios permitidos por `PATCH /api/users/:id`.
 * La API no admite modificar email, contraseña ni storageUsed por esta vía.
 */
export interface UpdateUserRequest {
  role?: UserRole;
  isActive?: boolean;
  /**
   * Cuota en bytes. Debe ser un entero positivo y no menor que `storageUsed`;
   * el backend responde 400 si no se cumple.
   */
  storageQuota?: number;
}
