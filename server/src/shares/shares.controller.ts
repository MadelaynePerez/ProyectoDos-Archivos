import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import type { ShareDocument } from './schemas/share.schema.js';
import {
  SharesService,
  type RevokedShare,
  type ShareListItem,
} from './shares.service.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de compartición bajo `/api/shares`.
 *
 * El usuario autenticado sale siempre del JWT. Un share de otro usuario se
 * responde como 404, igual que un recurso inexistente.
 */
@Controller('shares')
@UseGuards(JwtAuthGuard)
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  /** POST /api/shares — concede o actualiza un permiso. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  grant(
    @Body() dto: CreateShareDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareDocument> {
    return this.sharesService.grant(request.user.id, dto);
  }

  /** GET /api/shares/shared-by-me — permisos concedidos por el usuario. */
  @Get('shared-by-me')
  listSharedByMe(
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareListItem[]> {
    return this.sharesService.listSharedByMe(request.user.id);
  }

  /** GET /api/shares/shared-with-me — permisos recibidos por el usuario. */
  @Get('shared-with-me')
  listSharedWithMe(
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareListItem[]> {
    return this.sharesService.listSharedWithMe(request.user.id);
  }

  /** PATCH /api/shares/:id — cambia READ/COMMENT/EDIT. */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateShareDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<ShareDocument> {
    return this.sharesService.update(request.user.id, id, dto);
  }

  /** DELETE /api/shares/:id — retira el permiso. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  revoke(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<RevokedShare> {
    return this.sharesService.revoke(request.user.id, id);
  }
}
