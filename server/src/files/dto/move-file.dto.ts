import { IsDefined, IsMongoId, ValidateIf } from 'class-validator';

/**
 * Movimiento de un archivo a otra carpeta.
 *
 * `newFolderId` es obligatorio, pero admite `null` explícito para moverlo a
 * la raíz del usuario.
 */
export class MoveFileDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined({
    message: 'newFolderId es obligatorio; use null para mover a la raíz',
  })
  @IsMongoId({ message: 'newFolderId debe ser un ObjectId válido o null' })
  newFolderId: string | null;
}
