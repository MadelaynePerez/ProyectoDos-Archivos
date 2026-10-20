import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional } from 'class-validator';

/** Convierte cadenas vacías (`?userId=`) en `undefined`. */
const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Selección del usuario objetivo de un reporte.
 *
 * Si se omite, se usa el usuario autenticado. Un `USER` solo puede consultar su
 * propio id; un `ADMIN` puede consultar el de cualquier usuario.
 */
export class UserScopeQueryDto {
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsMongoId({ message: 'userId debe ser un ObjectId válido' })
  userId?: string;
}
