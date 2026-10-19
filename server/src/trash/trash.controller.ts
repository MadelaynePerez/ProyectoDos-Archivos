import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import type { FileDocument } from '../files/schemas/file.schema.js';
import type { FolderDocument } from '../folders/schemas/folder.schema.js';
import { TrashService } from './trash.service.js';
import type { PurgeResult, TrashItem } from './trash.types.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de la papelera bajo `/api/trash`.
 *
 * El usuario sale siempre del JWT: un recurso de otro usuario se responde como
 * 404, igual que uno que no está en papelera. `type` acepta `file` o `folder`
 * (sin distinguir mayúsculas).
 */
@Controller('trash')
@UseGuards(JwtAuthGuard)
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  /** GET /api/trash — raíces de borrado del usuario, por `deletedAt` desc. */
  @Get()
  list(@Req() request: AuthenticatedRequest): Promise<TrashItem[]> {
    return this.trashService.list(request.user.id);
  }

  /**
   * POST /api/trash/:type/:id/restore — restaura un archivo o una carpeta con
   * toda la cascada de su mismo `deletedRootId`.
   */
  @Post(':type/:id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument | FolderDocument> {
    return this.trashService.restore(request.user.id, type, id);
  }

  /** DELETE /api/trash/:type/:id — purga definitivamente un recurso. */
  @Delete(':type/:id')
  purge(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<PurgeResult> {
    return this.trashService.purge(request.user.id, type, id);
  }

  /** DELETE /api/trash — vacía la papelera completa del usuario. */
  @Delete()
  empty(@Req() request: AuthenticatedRequest): Promise<PurgeResult> {
    return this.trashService.empty(request.user.id);
  }
}
