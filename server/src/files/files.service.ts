import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import type { Readable } from 'node:stream';
import { TextDecoder } from 'node:util';
import {
  Model,
  mongo,
  Types,
  type Connection,
  type QueryFilter,
} from 'mongoose';

import {
  ActivityAction,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { Folder, type FolderDocument } from '../folders/schemas/folder.schema.js';
import { AccessService, EffectiveAccess } from '../shares/access.service.js';
import { User } from '../users/schemas/user.schema.js';
import {
  MAX_FILE_NAME_LENGTH,
  MAX_FILE_SIZE,
  type UploadedMemoryFile,
} from './files.constants.js';
import {
  FileSortBy,
  type ListFilesQueryDto,
  SortOrder,
} from './dto/list-files-query.dto.js';
import { MoveFileDto } from './dto/move-file.dto.js';
import { RenameFileDto } from './dto/rename-file.dto.js';
import { UploadFileDto } from './dto/upload-file.dto.js';
import {
  File,
  FileExtension,
  FileMimeType,
  type FileDocument,
} from './schemas/file.schema.js';

/** Resultado interno de validar un archivo subido en memoria. */
interface ValidatedUpload {
  name: string;
  extension: FileExtension;
  mimeType: FileMimeType;
  contentHash: string;
}

/** Metadatos que se guardan junto al binario en `fs.files`. */
interface GridFsMetadata {
  fileId: Types.ObjectId;
  ownerId: Types.ObjectId;
  contentType: FileMimeType;
}

/**
 * Archivos `.txt` y `.md`.
 *
 * El contenido vive en GridFS (`fs.files` + `fs.chunks`); la colección `files`
 * solo guarda metadatos. No se usan transacciones: cada operación sigue un
 * orden con compensaciones explícitas para no dejar binarios huérfanos.
 *
 * El acceso se resuelve con `AccessService`: el dueño tiene control total y un
 * invitado puede llegar por un share directo o heredado de su carpeta. Sin
 * acceso suficiente, un archivo ajeno responde 404 para no revelar su
 * existencia. Crear, mover y eliminar siguen siendo exclusivos del dueño.
 */
@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    @InjectModel(Folder.name)
    private readonly folderModel: Model<Folder>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly activityService: ActivityService,
    private readonly accessService: AccessService,
  ) {}

  /**
   * Sube un archivo a GridFS y después crea su metadata.
   *
   * Orden seguro sin transacciones:
   * 1. Validar extensión, MIME y contenido UTF-8.
   * 2. Escribir el binario en GridFS.
   * 3. Crear el documento en `files`.
   * 4. Incrementar `users.storageUsed`.
   * Si falla 3 o 4 se elimina el binario ya escrito (y el documento si llegó
   * a crearse), de modo que la subida sea todo-o-nada.
   */
  async upload(
    ownerId: string,
    dto: UploadFileDto,
    uploadedFile: UploadedMemoryFile | undefined,
  ): Promise<FileDocument> {
    const owner = new Types.ObjectId(ownerId);
    const validated = this.validateUploadedFile(uploadedFile);
    const folder = dto.folderId
      ? await this.findOwnedActiveFolder(dto.folderId, owner)
      : null;
    const folderId = folder?._id ?? null;

    await this.ensureNameAvailable(owner, folderId, validated.name);

    // Se generan los ids antes de escribir para poder compensar cualquier
    // fallo y para enlazar `fs.files.metadata.fileId` con `files._id`.
    const fileId = new Types.ObjectId();
    const gridFsId = new Types.ObjectId();

    try {
      await this.writeGridFs(gridFsId, validated.name, uploadedFile!.buffer, {
        fileId,
        ownerId: owner,
        contentType: validated.mimeType,
      });
    } catch (error) {
      await this.deleteGridFsQuietly(gridFsId);
      throw error;
    }

    let created: FileDocument | null = null;

    try {
      created = await this.fileModel.create({
        _id: fileId,
        name: validated.name,
        ownerId: owner,
        folderId,
        extension: validated.extension,
        mimeType: validated.mimeType,
        size: uploadedFile!.size,
        gridFsId,
        contentHash: validated.contentHash,
      });

      const userResult = await this.userModel
        .updateOne({ _id: owner }, { $inc: { storageUsed: uploadedFile!.size } })
        .exec();

      if (userResult.matchedCount === 0) {
        throw new NotFoundException('Usuario no encontrado');
      }
    } catch (error) {
      // El documento pudo crearse antes de fallar `$inc`; se elimina también.
      await this.fileModel.deleteOne({ _id: fileId }).exec().catch(() => {
        this.logger.warn(`No se pudo revertir el documento ${fileId}`);
      });
      await this.deleteGridFsQuietly(gridFsId);

      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe un archivo con ese nombre en la carpeta',
        );
      }
      throw error;
    }

    if (!created) {
      throw new InternalServerErrorException('No se pudo crear el archivo');
    }

    // El log se escribe al final, cuando el archivo y `storageUsed` ya son
    // consistentes. Un fallo del log no revierte una subida correcta.
    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.FILE_UPLOAD,
      resourceType: ActivityResourceType.FILE,
      resourceId: created._id,
      resourceName: created.name,
      metadata: {
        parentId: created.folderId,
        extension: created.extension,
        size: created.size,
      },
    });

    return created;
  }

  /** Lista metadatos de archivos activos de una carpeta o de la raíz. */
  async list(
    ownerId: string,
    query: ListFilesQueryDto,
  ): Promise<FileDocument[]> {
    const owner = new Types.ObjectId(ownerId);
    const filter: QueryFilter<File> = { isDeleted: false };

    if (query.folderId) {
      // Un invitado con READ+ puede listar una carpeta compartida. Sin acceso,
      // la carpeta se comporta como inexistente (404). Los archivos se filtran
      // por el dueño real de la carpeta, no por el usuario que consulta.
      const { resource: folder } = await this.accessService.requireFolderAccess(
        ownerId,
        query.folderId,
        EffectiveAccess.READ,
      );
      filter.ownerId = folder.ownerId;
      filter.folderId = folder._id;
    } else {
      // La raíz solo contiene archivos propios; los compartidos se consultan
      // en GET /api/shares/shared-with-me.
      filter.ownerId = owner;
      filter.folderId = null;
    }

    if (query.extension) {
      filter.extension = query.extension;
    }

    const search = query.search?.trim();
    if (search) {
      // Búsqueda por subcadena, sin distinguir mayúsculas. Se escapa el texto
      // para que caracteres como `.` o `*` no se interpreten como regex.
      filter.name = { $regex: this.escapeRegex(search), $options: 'i' };
    }

    return this.fileModel
      .find(filter)
      .sort(this.buildSort(query.sortBy, query.sortOrder))
      .exec();
  }

  /** Metadatos de un archivo propio o compartido con acceso READ+. */
  async findOne(userId: string, fileId: string): Promise<FileDocument> {
    const { resource } = await this.accessService.requireFileAccess(
      userId,
      fileId,
      EffectiveAccess.READ,
    );
    return resource;
  }

  /**
   * Prepara la descarga: valida propiedad y existencia del binario en GridFS.
   * El controller se encarga de fijar cabeceras y hacer `pipe`.
   */
  async getDownload(
    userId: string,
    fileId: string,
  ): Promise<{ file: FileDocument; stream: Readable }> {
    // READ es suficiente para ver metadatos y descargar, sea por share directo
    // o heredado de una carpeta (incluidos sus ancestros).
    const { resource: file } = await this.accessService.requireFileAccess(
      userId,
      fileId,
      EffectiveAccess.READ,
    );
    const bucket = this.getBucket();

    // Verificar el binario antes de enviar cabeceras evita un 200 con el
    // cuerpo cortado si `fs.files` desapareció.
    const gridFsFile = await bucket.find({ _id: file.gridFsId }).next();
    if (!gridFsFile) {
      throw new NotFoundException('Contenido del archivo no encontrado');
    }

    // Auditoría de la descarga. El `resourceName` es la copia del nombre y el
    // tamaño/extensión quedan como metadata acotada.
    await this.activityService.log({
      actorId: userId,
      action: ActivityAction.FILE_DOWNLOAD,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: { extension: file.extension, size: file.size },
    });

    return { file, stream: bucket.openDownloadStream(file.gridFsId) };
  }

  /**
   * Renombra conservando la extensión original.
   *
   * Pasos sin transacciones: validar nombre único, actualizar `files` y luego
   * renombrar en GridFS. Si falla GridFS se revierte el nombre en `files` para
   * no dejar metadatos y binario desalineados.
   */
  async rename(
    userId: string,
    fileId: string,
    dto: RenameFileDto,
  ): Promise<FileDocument> {
    // Renombrar es una modificación de metadata: requiere EDIT, que puede venir
    // de un share directo o heredado de la carpeta.
    const { resource: file } = await this.accessService.requireFileAccess(
      userId,
      fileId,
      EffectiveAccess.EDIT,
    );
    const owner = file.ownerId;
    const newName = this.buildRenamedFileName(
      file.name,
      file.extension,
      dto.name,
    );

    if (newName === file.name) {
      return file;
    }

    await this.ensureNameAvailable(owner, file.folderId, newName, file._id);

    const previousName = file.name;
    file.name = newName;

    try {
      await file.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe un archivo con ese nombre en la carpeta',
        );
      }
      throw error;
    }

    try {
      await this.getBucket().rename(file.gridFsId, newName);
    } catch {
      // Compensación: la metadata vuelve al nombre anterior.
      file.name = previousName;
      await file.save().catch(() => {
        this.logger.warn(
          `No se pudo revertir el nombre del archivo ${file._id}`,
        );
      });
      throw new InternalServerErrorException(
        'No se pudo renombrar el contenido del archivo',
      );
    }

    // Auditoría: `resourceName` es el nombre nuevo; el anterior queda como
    // metadata para poder reconstruir el cambio.
    await this.activityService.log({
      actorId: userId,
      action: ActivityAction.FILE_RENAME,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: { previousName },
    });

    return file;
  }

  /** Mueve un archivo a otra carpeta activa del mismo dueño o a la raíz. */
  async move(
    ownerId: string,
    fileId: string,
    dto: MoveFileDto,
  ): Promise<FileDocument> {
    // Mover es una operación estructural: sigue siendo exclusiva del dueño.
    const { resource: file } = await this.accessService.requireFileAccess(
      ownerId,
      fileId,
      EffectiveAccess.OWNER,
    );
    const owner = file.ownerId;
    const fromFolderId = file.folderId;

    let newFolderId: Types.ObjectId | null = null;

    if (dto.newFolderId !== null) {
      if (!Types.ObjectId.isValid(dto.newFolderId)) {
        throw new NotFoundException('Carpeta destino no encontrada');
      }

      const folder = await this.folderModel
        .findOne({ _id: dto.newFolderId, ownerId: owner })
        .exec();

      if (!folder) {
        // Incluye carpetas de otro usuario: 404 para no revelar que existen.
        throw new NotFoundException('Carpeta destino no encontrada');
      }

      if (folder.isDeleted) {
        throw new ConflictException('La carpeta destino está en la papelera');
      }

      newFolderId = folder._id;
    }

    // Invariante del modelo: el nombre es único en la carpeta de destino.
    await this.ensureNameAvailable(owner, newFolderId, file.name, file._id);

    file.folderId = newFolderId;

    try {
      await file.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe un archivo con ese nombre en la carpeta destino',
        );
      }
      throw error;
    }

    // Auditoría del cambio de carpeta.
    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.FILE_MOVE,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: { fromFolderId, toFolderId: file.folderId },
    });

    return file;
  }

  /**
   * Reemplaza el contenido de un archivo.
   *
   * Orden seguro sin transacciones:
   * 1. Escribir el nuevo binario en GridFS (el anterior sigue intacto).
   * 2. Actualizar `gridFsId`, `size`, `contentHash` y `updatedAt` en `files`.
   * 3. Ajustar `storageUsed` con la diferencia de tamaño.
   * 4. Borrar el binario anterior.
   * Si falla 2 o 3 se revierte la metadata y se elimina el binario nuevo.
   */
  async updateContent(
    userId: string,
    fileId: string,
    uploadedFile: UploadedMemoryFile | undefined,
  ): Promise<FileDocument> {
    // EDIT permite reemplazar contenido; MOVE/DELETE siguen reservados al
    // propietario. El almacenamiento siempre se contabiliza al dueño real.
    const { resource: file } = await this.accessService.requireFileAccess(
      userId,
      fileId,
      EffectiveAccess.EDIT,
    );
    const owner = file.ownerId;
    const validated = this.validateUploadedFile(uploadedFile);

    // La extensión no puede cambiar por esta vía; para eso existe renombrar,
    // que también la conserva. El MIME se recalcula a partir de la extensión.
    if (validated.extension !== file.extension) {
      throw new BadRequestException(
        `El archivo debe conservar la extensión .${file.extension}`,
      );
    }

    const newGridFsId = new Types.ObjectId();

    try {
      await this.writeGridFs(newGridFsId, file.name, uploadedFile!.buffer, {
        fileId: file._id,
        ownerId: owner,
        contentType: file.mimeType,
      });
    } catch (error) {
      await this.deleteGridFsQuietly(newGridFsId);
      throw error;
    }

    const previousGridFsId = file.gridFsId;
    const previousSize = file.size;
    const previousContentHash = file.contentHash;

    try {
      file.gridFsId = newGridFsId;
      file.size = uploadedFile!.size;
      file.contentHash = validated.contentHash;
      await file.save();
    } catch (error) {
      await this.deleteGridFsQuietly(newGridFsId);
      throw error;
    }

    const storageDelta = uploadedFile!.size - previousSize;

    if (storageDelta !== 0) {
      try {
        const userResult = await this.userModel
          .updateOne({ _id: owner }, { $inc: { storageUsed: storageDelta } })
          .exec();

        if (userResult.matchedCount === 0) {
          throw new NotFoundException('Usuario no encontrado');
        }
      } catch (error) {
        // Compensación: volver a apuntar al binario anterior y ajustar tamaño.
        file.gridFsId = previousGridFsId;
        file.size = previousSize;
        file.contentHash = previousContentHash;
        await file.save().catch(() => {
          this.logger.warn(
            `No se pudo revertir la metadata del archivo ${file._id}`,
          );
        });
        await this.deleteGridFsQuietly(newGridFsId);
        throw error;
      }
    }

    // Solo después de que la metadata ya apunta al binario nuevo se elimina el
    // anterior. Si esta limpieza falla, queda un huérfano recuperable por
    // reconciliación; el archivo sigue siendo correcto.
    try {
      await this.getBucket().delete(previousGridFsId);
    } catch (error) {
      this.logger.warn(
        `No se pudo borrar el binario anterior ${previousGridFsId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Auditoría del reemplazo de contenido, con el tamaño nuevo y el delta.
    await this.activityService.log({
      actorId: userId,
      action: ActivityAction.FILE_UPDATE,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: {
        size: file.size,
        previousSize,
        delta: storageDelta,
      },
    });

    return file;
  }

  /**
   * Valida extensión, MIME declarado y contenido real.
   *
   * La comprobación UTF-8 con `fatal: true` y el rechazo de bytes NUL impiden
   * aceptar binarios renombrados a `.txt` o `.md` aunque el cliente declare un
   * MIME textual.
   */
  private validateUploadedFile(
    file: UploadedMemoryFile | undefined,
  ): ValidatedUpload {
    if (!file || !file.buffer) {
      throw new BadRequestException('El campo "file" es obligatorio');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException(
        `El archivo no puede superar ${MAX_FILE_SIZE} bytes`,
      );
    }

    const name = basename(file.originalname ?? '').trim();
    if (!name) {
      throw new BadRequestException('El nombre del archivo es obligatorio');
    }
    if (name.length > MAX_FILE_NAME_LENGTH) {
      throw new BadRequestException(
        `El nombre no puede superar ${MAX_FILE_NAME_LENGTH} caracteres`,
      );
    }

    const extensionValue = extname(name).toLowerCase().slice(1);
    if (
      extensionValue !== FileExtension.TXT &&
      extensionValue !== FileExtension.MD
    ) {
      throw new BadRequestException('Solo se permiten archivos .txt y .md');
    }
    const extension = extensionValue as FileExtension;

    // Solo se aceptan tipos textuales. Un PDF declarado como application/pdf
    // se rechaza aquí; un binario declarado como text/plain se rechaza abajo.
    const declaredMime = (file.mimetype ?? '')
      .toLowerCase()
      .split(';')[0]
      .trim();
    if (
      declaredMime !== FileMimeType.TXT &&
      declaredMime !== FileMimeType.MD
    ) {
      throw new BadRequestException(
        'El tipo de contenido debe ser text/plain o text/markdown',
      );
    }

    if (file.buffer.includes(0)) {
      throw new BadRequestException(
        'El contenido no es texto UTF-8 válido (contiene bytes NUL)',
      );
    }

    try {
      new TextDecoder('utf-8', { fatal: true }).decode(file.buffer);
    } catch {
      throw new BadRequestException(
        'El contenido no es texto UTF-8 válido',
      );
    }

    // El MIME almacenado se normaliza según la extensión; así `.md` siempre
    // queda como text/markdown y `.txt` como text/plain.
    const mimeType =
      extension === FileExtension.MD
        ? FileMimeType.MD
        : FileMimeType.TXT;

    return {
      name,
      extension,
      mimeType,
      contentHash: createHash('sha256').update(file.buffer).digest('hex'),
    };
  }

  /** Conserva la extensión actual y rechaza intentos de cambiarla. */
  private buildRenamedFileName(
    currentName: string,
    extension: FileExtension,
    requestedName: string,
  ): string {
    const trimmed = basename(requestedName.trim()).trim();
    const requestedExtension = extname(trimmed).toLowerCase();
    const currentExtension = `.${extension}`;

    if (requestedExtension && requestedExtension !== currentExtension) {
      throw new BadRequestException(
        `El archivo debe conservar la extensión ${currentExtension}`,
      );
    }

    const base = requestedExtension
      ? trimmed.slice(0, -requestedExtension.length).trim()
      : trimmed;

    if (!base) {
      throw new BadRequestException('El nombre no puede estar vacío');
    }

    const finalName = requestedExtension
      ? trimmed
      : `${base}${currentExtension}`;

    if (finalName.length > MAX_FILE_NAME_LENGTH) {
      throw new BadRequestException(
        `El nombre no puede superar ${MAX_FILE_NAME_LENGTH} caracteres`,
      );
    }

    return finalName;
  }

  private async findOwnedActiveFolder(
    folderId: string,
    ownerId: Types.ObjectId,
  ): Promise<FolderDocument> {
    if (!Types.ObjectId.isValid(folderId)) {
      throw new NotFoundException('Carpeta no encontrada');
    }

    const folder = await this.folderModel
      .findOne({ _id: folderId, ownerId, isDeleted: false })
      .exec();

    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada');
    }

    return folder;
  }

  /** Nombre único entre archivos activos de la misma carpeta y dueño. */
  private async ensureNameAvailable(
    ownerId: Types.ObjectId,
    folderId: Types.ObjectId | null,
    name: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<File> = {
      ownerId,
      folderId,
      name,
      isDeleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const exists = await this.fileModel.exists(filter);
    if (exists) {
      throw new ConflictException(
        'Ya existe un archivo con ese nombre en la carpeta',
      );
    }
  }

  private buildSort(
    sortBy: FileSortBy = FileSortBy.NAME,
    sortOrder: SortOrder = SortOrder.ASC,
  ): Record<string, 1 | -1> {
    const direction = sortOrder === SortOrder.DESC ? -1 : 1;

    if (sortBy === FileSortBy.DATE) {
      return { createdAt: direction, name: 1 };
    }

    if (sortBy === FileSortBy.SIZE) {
      return { size: direction, name: 1 };
    }

    return { name: direction };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getBucket(): mongo.GridFSBucket {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }
    return new mongo.GridFSBucket(db, { bucketName: 'fs' });
  }

  /** Escribe un buffer completo en GridFS y espera a que termine. */
  private writeGridFs(
    gridFsId: Types.ObjectId,
    filename: string,
    buffer: Buffer,
    metadata: GridFsMetadata,
  ): Promise<void> {
    const bucket = this.getBucket();
    const uploadStream = bucket.openUploadStream(filename, {
      id: gridFsId,
      metadata,
    });

    return new Promise<void>((resolve, reject) => {
      uploadStream.once('finish', () => resolve());
      uploadStream.once('error', reject);
      uploadStream.end(buffer);
    });
  }

  /**
   * Borra un binario best-effort. Si `fs.files` no llegó a crearse (fallo a
   * mitad de subida), elimina directamente los chunks huérfanos.
   */
  private async deleteGridFsQuietly(gridFsId: Types.ObjectId): Promise<void> {
    try {
      await this.getBucket().delete(gridFsId);
      return;
    } catch {
      // Puede no existir fs.files; se intenta limpiar chunks por files_id.
    }

    try {
      const db = this.connection.db;
      if (db) {
        await db
          .collection('fs.chunks')
          .deleteMany({ files_id: gridFsId });
      }
    } catch (error) {
      this.logger.warn(
        `No se pudo limpiar el binario ${gridFsId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
