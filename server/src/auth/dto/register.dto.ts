import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO de registro público.
 *
 * NO declara `role`: con el ValidationPipe global (`whitelist: true`) cualquier
 * `role` que envíe el cliente se descarta y UsersService crea siempre un USER.
 */
export class RegisterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email debe ser una dirección válida' })
  email: string;

  @IsString({ message: 'name debe ser texto' })
  @IsNotEmpty({ message: 'name es obligatorio' })
  @MaxLength(120, { message: 'name no puede superar 120 caracteres' })
  name: string;

  @IsString({ message: 'password debe ser texto' })
  @MinLength(8, { message: 'password debe tener al menos 8 caracteres' })
  @MaxLength(72, { message: 'password no puede superar 72 caracteres' })
  password: string;
}
