import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserRole } from './schemas/user.schema.js';
import { type StorageSummary, UsersService } from './users.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de usuarios.
 *
 * `GET /users/me/storage` solo exige JWT; el resto son rutas de administración
 * y requieren además rol ADMIN (RolesGuard + @Roles).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/users/me/storage — cuota, uso y espacio disponible del usuario
   * autenticado. El id sale siempre del JWT, nunca de la URL.
   */
  @Get('me/storage')
  getMyStorage(@Req() request: AuthenticatedRequest): Promise<StorageSummary> {
    return this.usersService.getStorage(request.user.id);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(): Promise<Record<string, unknown>[]> {
    return this.usersService.findAll();
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    return this.usersService.update(id, dto);
  }
}
