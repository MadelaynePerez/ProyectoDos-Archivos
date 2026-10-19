import { Transform } from 'class-transformer';
import {
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Alta de carpeta. `parentId` es opcional: si se omite (o se envía `null`),
 * la carpeta se crea en la raíz del usuario autenticado.
 */
export class CreateFolderDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(255, { message: 'name no puede superar 255 caracteres' })
  name: string;

  @IsOptional()
  @IsMongoId({ message: 'parentId debe ser un ObjectId válido' })
  parentId?: string;
}
