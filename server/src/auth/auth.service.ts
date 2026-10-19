import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import type { JwtPayload } from './interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /** Alta pública: siempre delega en createUser, que fuerza el rol USER. */
  register(dto: RegisterDto): Promise<Record<string, unknown>> {
    return this.usersService.createUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
    });
  }

  async login(dto: LoginDto): Promise<{
    accessToken: string;
    user: Record<string, unknown>;
  }> {
    // select('+passwordHash'): imprescindible porque el esquema lo oculta.
    const user = await this.usersService.findByEmail(dto.email, true);
    if (!user) {
      // Mensaje genérico: no se revela si el email existe o no.
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordOk = await this.usersService.verifyPassword(
      dto.password,
      user.passwordHash,
    );
    if (!passwordOk) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Invariante: un usuario desactivado no puede iniciar sesión, aunque la
    // contraseña sea correcta. Sus datos e historial se conservan.
    if (!user.isActive) {
      throw new UnauthorizedException('La cuenta está desactivada');
    }

    // Se registra el último login correcto.
    user.lastLoginAt = new Date();
    await user.save();

    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: this.usersService.toPublic(user),
    };
  }
}
