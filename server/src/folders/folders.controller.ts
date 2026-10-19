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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { MoveFolderDto } from './dto/move-folder.dto.js';
import { RenameFolderDto } from './dto/rename-folder.dto.js';
import { FoldersService } from './folders.service.js';
import type { FolderDocument } from './schemas/folder.schema.js';

/** Request ya autenticado por JwtAuthGuard; `user` lo adjunta la estrategia. */
type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Endpoints de carpetas bajo `/api/folders`.
 *
 * El dueño SIEMPRE sale de `request.user` (token JWT), nunca del body ni de la
 * URL. Una carpeta de otro usuario se responde como 404 para no revelar que
 * existe.
 */
@Controller('folders')
@UseGuards(JwtAuthGuard)
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  /** POST /api/folders — crea una carpeta en la raíz o dentro de `parentId`. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateFolderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FolderDocument> {
    return this.foldersService.create(request.user.id, dto);
  }

  /**
   * GET /api/folders?parentId=<id> — lista las subcarpetas activas.
   * Sin `parentId` (o vacío) lista la raíz del usuario.
   */
  @Get()
  list(
    @Query('parentId') parentId: string | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<FolderDocument[]> {
    return this.foldersService.listByParent(request.user.id, parentId);
  }

  /** PATCH /api/folders/:id/rename — renombra una carpeta. */
  @Patch(':id/rename')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameFolderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FolderDocument> {
    return this.foldersService.rename(request.user.id, id, dto);
  }

  /** PATCH /api/folders/:id/move — mueve la carpeta y su subárbol. */
  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveFolderDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FolderDocument> {
    return this.foldersService.move(request.user.id, id, dto);
  }

  /** DELETE /api/folders/:id — envía la carpeta y su contenido a papelera. */
  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{
    folderId: string;
    name: string;
    affectedFolders: number;
    affectedFiles: number;
  }> {
    return this.foldersService.remove(request.user.id, id);
  }
}
