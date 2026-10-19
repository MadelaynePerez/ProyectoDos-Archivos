import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  JwtModule,
  type JwtModuleOptions,
  type JwtSignOptions,
} from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ActivityModule } from '../activity/activity.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

@Module({
  imports: [
    // UsersService es necesario para registrar y validar credenciales.
    UsersModule,
    // Registro de AUTH_LOGIN tras un login correcto.
    ActivityModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // `expiresIn` espera el tipo plantilla de `ms`; el valor llega de
          // .env como string libre, por eso se estrecha explícitamente.
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
            '1h') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  // JwtStrategy registra la estrategia 'jwt' que usa JwtAuthGuard.
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
