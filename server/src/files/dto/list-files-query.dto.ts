import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { FileExtension } from '../schemas/file.schema.js';

/** Campos por los que se puede ordenar un listado de archivos. */
export enum FileSortBy {
  NAME = 'name',
  DATE = 'date',
  SIZE = 'size',
}

/** Dirección del ordenamiento. */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

const limpiarTexto = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

/**
 * Filtros y ordenamiento de `GET /api/files`.
 * `date` se traduce a `createdAt` en el servicio.
 */
export class ListFilesQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === 'null' ? undefined : value,
  )
  @IsOptional()
  @IsMongoId({ message: 'folderId debe ser un ObjectId válido' })
  folderId?: string;

  @Transform(({ value }: { value: unknown }) => limpiarTexto(value))
  @IsOptional()
  @IsString({ message: 'search debe ser texto' })
  @MaxLength(120, { message: 'search no puede superar 120 caracteres' })
  search?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @IsEnum(FileExtension, { message: 'extension debe ser txt o md' })
  extension?: FileExtension;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @IsEnum(FileSortBy, {
    message: 'sortBy debe ser name, date o size',
  })
  sortBy?: FileSortBy;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || undefined : value,
  )
  @IsOptional()
  @IsEnum(SortOrder, { message: 'sortOrder debe ser asc o desc' })
  sortOrder?: SortOrder;
}
