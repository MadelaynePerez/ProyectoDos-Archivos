import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { ListFilesQueryDto } from './dto/list-files-query.dto.js';
import { MoveFileDto } from './dto/move-file.dto.js';
import { RenameFileDto } from './dto/rename-file.dto.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import { MAX_FILE_SIZE, type UploadedMemoryFile } from './files.constants.js';
import { FilesService } from './files.service.js';
import type { FileDocument } from './schemas/file.schema.js';

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/**
 * Opciones de Multer para subida y reemplazo de contenido.
 * Sin `storage` explícito, Multer usa memoria (el servicio necesita el buffer
 * completo para validar UTF-8 y escribirlo en GridFS).
 */
const MULTIPART_OPTIONS = {
  limits: { fileSize: MAX_FILE_SIZE },
  // Conserva nombres UTF-8 (acentos, ñ) enviados por el navegador.
  defParamCharset: 'utf8',
};

/**
 * Endpoints de archivos bajo `/api/files`.
 *
 * El dueño siempre sale del JWT. Los archivos de otro usuario se responden
 * como 404 para no revelar que existen.
 */
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /** POST /api/files — subida multipart; campo `file`, `folderId` opcional. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  upload(
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Body() dto: UploadFileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument> {
    return this.filesService.upload(request.user.id, dto, file);
  }

  /** GET /api/files — listado con filtros y orden. */
  @Get()
  list(
    @Query() query: ListFilesQueryDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument[]> {
    return this.filesService.list(request.user.id, query);
  }

  /**
   * GET /api/files/:id/download — stream del contenido desde GridFS con el
   * Content-Type correspondiente.
   */
  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    const { file, stream } = await this.filesService.getDownload(
      request.user.id,
      id,
    );

    // `filename*` conserva nombres no ASCII; `filename` es el fallback seguro
    // restringido a ASCII imprimible para que la cabecera nunca sea inválida.
    const fallbackName = file.name
      .replace(/[^\x20-\x7E]/g, '_')
      .replace(/["\\]/g, '_');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodeURIComponent(
        file.name,
      )}`,
    );
    response.setHeader('Content-Type', `${file.mimeType}; charset=utf-8`);
    response.setHeader('Content-Length', String(file.size));
    response.setHeader('X-Content-Type-Options', 'nosniff');

    stream.on('error', (error: Error) => {
      if (!response.headersSent) {
        response.status(500).json({
          statusCode: 500,
          message: 'No se pudo descargar el archivo',
        });
        return;
      }
      response.destroy(error);
    });

    stream.pipe(response);
  }

  /** GET /api/files/:id — metadatos del archivo. */
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument> {
    return this.filesService.findOne(request.user.id, id);
  }

  /** PATCH /api/files/:id/rename — renombra conservando la extensión. */
  @Patch(':id/rename')
  rename(
    @Param('id') id: string,
    @Body() dto: RenameFileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument> {
    return this.filesService.rename(request.user.id, id, dto);
  }

  /** PATCH /api/files/:id/move — mueve a otra carpeta o a la raíz. */
  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveFileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument> {
    return this.filesService.move(request.user.id, id, dto);
  }

  /** PUT /api/files/:id/content — reemplaza el contenido (multipart). */
  @Put(':id/content')
  @UseInterceptors(FileInterceptor('file', MULTIPART_OPTIONS))
  updateContent(
    @Param('id') id: string,
    @UploadedFile() file: UploadedMemoryFile | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<FileDocument> {
    return this.filesService.updateContent(request.user.id, id, file);
  }
}
