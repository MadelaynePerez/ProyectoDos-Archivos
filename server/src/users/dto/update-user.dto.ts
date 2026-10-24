import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

import { UserRole } from '../schemas/user.schema.js';

/**
 * Cambios permitidos sobre un usuario. Deliberadamente NO incluye email,
 * password ni storageUsed: esos datos se gestionan por flujos propios.
 * `storageQuota` solo puede fijarlo un ADMIN y nunca por debajo de lo usado;
 * esa segunda regla se valida en el servicio porque depende del documento.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'role debe ser ADMIN o USER' })
  role?: UserRole;

  @IsOptional()
  @IsBoolean({ message: 'isActive debe ser true o false' })
  isActive?: boolean;

  @IsOptional()
  @IsInt({ message: 'storageQuota debe ser un entero positivo' })
  @Min(1, { message: 'storageQuota debe ser un entero positivo' })
  storageQuota?: number;
}
