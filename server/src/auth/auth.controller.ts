import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/auth/register — alta pública, siempre crea un USER. */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<Record<string, unknown>> {
    return this.authService.register(dto);
  }

  /** POST /api/auth/login — devuelve el JWT y el usuario sin passwordHash. */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<{
    accessToken: string;
    user: Record<string, unknown>;
  }> {
    return this.authService.login(dto);
  }
}
