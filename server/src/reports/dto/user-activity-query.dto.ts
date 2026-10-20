import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional } from 'class-validator';

import { DateRangeQueryDto } from './date-range-query.dto.js';

/** Convierte cadenas vacías (`?userId=`) en `undefined`. */
const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Historial de un usuario. Combina el rango de fechas con el usuario objetivo;
 * si `userId` se omite se consulta el historial del usuario autenticado.
 */
export class UserActivityQueryDto extends DateRangeQueryDto {
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsMongoId({ message: 'userId debe ser un ObjectId válido' })
  userId?: string;
}
