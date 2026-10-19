import { UserRole } from '../../users/schemas/user.schema.js';

/** Contenido firmado dentro del JWT. */
export interface JwtPayload {
  /** `_id` del usuario (subject). */
  sub: string;
  email: string;
  role: UserRole;
}

/** Usuario resuelto por la estrategia y adjuntado a `request.user`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}
