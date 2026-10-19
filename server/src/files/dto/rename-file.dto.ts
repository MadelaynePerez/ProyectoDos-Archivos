import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Nuevo nombre del archivo. Puede enviarse con o sin la extensión actual;
 * el servicio conserva siempre la extensión original.
 */
export class RenameFileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(255, { message: 'name no puede superar 255 caracteres' })
  name: string;
}
