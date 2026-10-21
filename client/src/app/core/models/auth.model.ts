import type { User } from './user.model';

/** Credenciales aceptadas por `POST /api/auth/login`. */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Datos del registro público (`POST /api/auth/register`).
 * El backend siempre asigna el rol USER e ignora cualquier rol enviado.
 */
export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

/** Respuesta de `POST /api/auth/login`: token JWT + usuario autenticado. */
export interface AuthResponse {
  accessToken: string;
  user: User;
}
