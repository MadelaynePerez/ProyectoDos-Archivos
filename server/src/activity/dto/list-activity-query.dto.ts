import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

/** Convierte cadenas vacías (`?from=`) en `undefined` para no fallar la validación. */
const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Filtros y paginación de `GET /api/activity`.
 *
 * El historial siempre se limita al usuario autenticado; el cliente no puede
 * consultar el de otro usuario. `from` y `to` son instantes ISO 8601 y el rango
 * es inclusivo en ambos extremos.
 */
export class ListActivityQueryDto {
  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'from debe ser una fecha ISO 8601 válida' },
  )
  from?: string;

  @Transform(({ value }: { value: unknown }) => emptyToUndefined(value))
  @IsOptional()
  @IsISO8601(
    { strict: true },
    { message: 'to debe ser una fecha ISO 8601 válida' },
  )
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page debe ser un entero' })
  @Min(1, { message: 'page debe ser mayor o igual a 1' })
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser mayor o igual a 1' })
  @Max(100, { message: 'limit no puede superar 100' })
  limit = 20;
}
