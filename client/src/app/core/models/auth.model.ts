import type { User } from './user.model';

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
