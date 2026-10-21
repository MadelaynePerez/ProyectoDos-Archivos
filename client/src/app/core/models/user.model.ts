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

/** Credenciales aceptadas por `POST /api/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Respuesta de `POST /api/auth/login`: token JWT + usuario autenticado. */
export interface AuthResponse {
  accessToken: string;
  user: User;
}
