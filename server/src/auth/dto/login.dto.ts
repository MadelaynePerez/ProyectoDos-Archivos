import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email debe ser una dirección válida' })
  email: string;

  @IsString({ message: 'password debe ser texto' })
  @IsNotEmpty({ message: 'password es obligatorio' })
  password: string;
}
