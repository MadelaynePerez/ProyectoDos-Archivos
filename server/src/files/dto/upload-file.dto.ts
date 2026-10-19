import { Transform } from 'class-transformer';
import { IsMongoId, IsOptional } from 'class-validator';

/**
 * Campos de texto que acompañan al multipart de subida.
 * `folderId` es opcional: si se omite, el archivo queda en la raíz del usuario.
 */
export class UploadFileDto {
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === 'null' ? undefined : value,
  )
  @IsOptional()
  @IsMongoId({ message: 'folderId debe ser un ObjectId válido' })
  folderId?: string;
}
