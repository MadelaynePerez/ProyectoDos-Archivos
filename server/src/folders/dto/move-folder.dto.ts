import { IsDefined, IsMongoId, ValidateIf } from 'class-validator';

/**
 * Movimiento de una carpeta a otro padre.
 *
 * `newParentId` es obligatorio, pero admite `null` explícito para mover la
 * carpeta a la raíz del usuario. `ValidateIf` deja pasar el `null`; cualquier
 * otro valor (incluido `undefined`) debe ser un ObjectId válido.
 */
export class MoveFolderDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined({
    message: 'newParentId es obligatorio; use null para mover a la raíz',
  })
  @IsMongoId({ message: 'newParentId debe ser un ObjectId válido o null' })
  newParentId: string | null;
}
