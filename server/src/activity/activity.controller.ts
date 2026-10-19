import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { ActivityService, type PaginatedActivity } from './activity.service.js';
import { ListActivityQueryDto } from './dto/list-activity-query.dto.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de auditoría bajo `/api/activity`.
 *
 * Solo se expone la lectura del historial propio. No hay rutas para modificar
 * ni borrar eventos: `activity_log` es append-only.
 */
@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  /**
   * GET /api/activity — historial del usuario autenticado.
   * Filtros opcionales `from`/`to` (ISO 8601) y paginación `page`/`limit`.
   */
  @Get()
  list(
    @Query() query: ListActivityQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<PaginatedActivity> {
    return this.activityService.findForActor(request.user.id, query);
  }
}
