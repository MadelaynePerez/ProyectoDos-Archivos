import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../users/schemas/user.schema.js';

/** Clave con la que RolesGuard lee los roles exigidos por un endpoint. */
export const ROLES_KEY = 'roles';

/**
 * Restringe un handler/controlador a los roles indicados.
 * Se evalúa junto a RolesGuard después de JwtAuthGuard.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
