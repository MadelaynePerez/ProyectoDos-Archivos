/** Roles válidos del sistema, iguales a los del backend. */
export type UserRole = 'ADMIN' | 'USER';

/** Documento público de `users`: la API nunca devuelve `passwordHash`. */
export interface User {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  storageUsed: number;
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
}
