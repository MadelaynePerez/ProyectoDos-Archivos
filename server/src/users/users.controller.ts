import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';

import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UserRole } from './schemas/user.schema.js';
import { UsersService } from './users.service.js';

/**
 * Endpoints de administración de usuarios.
 * Requieren JWT válido (JwtAuthGuard) y rol ADMIN (RolesGuard + @Roles).
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): Promise<Record<string, unknown>[]> {
    return this.usersService.findAll();
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<Record<string, unknown>> {
    return this.usersService.update(id, dto);
  }
}
