import { Transform } from 'class-transformer';
import { IsISO8601, IsOptional } from 'class-validator';

/** Convierte cadenas vacías (`?from=`) en `undefined` para no fallar la validación. */
const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Rango de fechas ISO 8601 usado por los reportes.
 *
 * Ambos extremos son inclusivos y se aplican sobre `createdAt` en UTC. Los
 * filtros son opcionales, pero si se envían deben ser fechas válidas y `from`
 * no puede ser posterior a `to` (la comparación se valida en el servicio).
 */
export class DateRangeQueryDto {
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
}
