import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

import { UserRole } from '../schemas/user.schema.js';

/**
 * Cambios permitidos sobre un usuario. Deliberadamente NO incluye email,
 * password ni storageUsed: esos datos se gestionan por flujos propios.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'role debe ser ADMIN o USER' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive?: boolean;
}
