import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types, type Connection, type QueryFilter } from 'mongoose';

import {
  ActivityAction,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { File, type FileDocument } from '../files/schemas/file.schema.js';
import {
  Folder,
  type FolderDocument,
} from '../folders/schemas/folder.schema.js';
import { Share, ShareResourceType } from '../shares/schemas/share.schema.js';
import { User } from '../users/schemas/user.schema.js';
import {
  TrashResourceType,
  type PurgeResult,
  type TrashItem,
} from './trash.types.js';

/** Datos que se limpian al restaurar un recurso. */
const RESTORE_FIELDS = {
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletedRootId: null,
};

/**
 * Papelera lógica (`TrashModule`).
 *
 * La papelera no es una colección aparte: se representa con `isDeleted`,
 * `deletedAt`, `deletedBy` y `deletedRootId` en `files` y `folders`. El
 * `deletedRootId` agrupa la cascada de un borrado, de modo que restaurar la
 * raíz recupera exactamente los recursos borrados en esa operación y no los
 * que ya estaban en papelera por un borrado anterior.
 *
 * Sin transacciones (MongoDB standalone):
 * - Las operaciones reversibles (borrado lógico y restauración) escriben el
 *   log al final, cuando el estado ya quedó correcto.
 * - La purga es destructiva: primero escribe el log (para conservar nombre,
 *   contadores y `batchId`) y solo después borra GridFS, shares y documentos.
 * - `storageUsed` se resta únicamente en la purga, con un `$inc` atómico.
 */
@Injectable()
export class TrashService {
  constructor(
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    @InjectModel(Folder.name)
    private readonly folderModel: Model<Folder>,
    @InjectModel(Share.name)
    private readonly shareModel: Model<Share>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * DELETE /api/files/:id
   *
   * Envía un archivo a la papelera. Solo el propietario puede hacerlo:
   * un invitado con `EDIT` recibe 404. No se toca GridFS ni `storageUsed`,
   * porque el espacio sigue ocupado hasta la purga definitiva.
   */
  async softDeleteFile(ownerId: string, fileId: string): Promise<FileDocument> {
    const owner = new Types.ObjectId(ownerId);
    const id = this.parseId(fileId);
    const now = new Date();

    const file = await this.fileModel
      .findOneAndUpdate(
        { _id: id, ownerId: owner, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: owner,
            // Un archivo suelto es la raíz de su propio borrado.
            deletedRootId: id,
          },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!file) {
      throw new NotFoundException('Archivo no encontrado');
    }

    // Operación reversible: el log va al final, cuando el estado ya es válido.
    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.FILE_DELETE,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: {
        parentId: file.folderId,
        extension: file.extension,
        size: file.size,
      },
    });

    return file;
  }

  /**
   * GET /api/trash
   *
   * Lista únicamente las raíces de cada borrado (`deletedRootId == _id`).
   * Los descendientes de una carpeta no aparecen por separado: se restauran o
   * purgan junto con su raíz. El resultado combina archivos y carpetas y se
   * ordena por `deletedAt` descendente.
   */
  async list(ownerId: string): Promise<TrashItem[]> {
    const owner = new Types.ObjectId(ownerId);

    // `$expr` compara dos campos del mismo documento. Es la forma directa de
    // pedir solo raíces sin traer toda la papelera para filtrarla en memoria.
    const rootsFilter = {
      ownerId: owner,
      isDeleted: true,
      $expr: { $eq: ['$deletedRootId', '$_id'] },
    };

    const [files, folders] = await Promise.all([
      this.fileModel
        .find(rootsFilter as QueryFilter<File>)
        .sort({ deletedAt: -1, _id: -1 })
        .lean()
        .exec(),
      this.folderModel
        .find(rootsFilter as QueryFilter<Folder>)
        .sort({ deletedAt: -1, _id: -1 })
        .lean()
        .exec(),
    ]);

    const items: TrashItem[] = [
      ...files.map((file) => ({
        type: TrashResourceType.FILE,
        ...file,
      })),
      ...folders.map((folder) => ({
        type: TrashResourceType.FOLDER,
        ...folder,
      })),
    ];

    // Orden global por fecha de borrado; `_id` desempata de forma estable.
    items.sort((a, b) => {
      const aTime = a.deletedAt ? a.deletedAt.getTime() : 0;
      const bTime = b.deletedAt ? b.deletedAt.getTime() : 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return b._id.toString().localeCompare(a._id.toString());
    });

    return items;
  }

  /**
   * POST /api/trash/:type/:id/restore
   *
   * Restaura un archivo o una carpeta. Reglas:
   * - El padre debe estar activo; si sigue en papelera, 409 (el cliente debe
   *   restaurar primero el ancestro).
   * - El nombre no puede chocar con un hermano activo; si choca, 409.
   * - Restaurar una carpeta restaura también todos los documentos con
   *   `deletedRootId = carpeta._id` (sus descendientes del mismo borrado).
   */
  async restore(
    ownerId: string,
    type: string,
    resourceId: string,
  ): Promise<FileDocument | FolderDocument> {
    const resourceType = this.parseType(type);
    const owner = new Types.ObjectId(ownerId);
    const id = this.parseId(resourceId);

    if (resourceType === TrashResourceType.FILE) {
      return this.restoreFile(ownerId, owner, id);
    }

    return this.restoreFolder(ownerId, owner, id);
  }

  /**
   * DELETE /api/trash/:type/:id
   *
   * Purga definitivamente un recurso. El log se escribe antes de destruir
   * nada. En una carpeta se elimina todo el subárbol (`ancestors`) y todos sus
   * archivos, estén o no en papelera, porque el subárbol desaparece
   * físicamente.
   */
  async purge(
    ownerId: string,
    type: string,
    resourceId: string,
  ): Promise<PurgeResult> {
    const resourceType = this.parseType(type);
    const owner = new Types.ObjectId(ownerId);
    const id = this.parseId(resourceId);

    if (resourceType === TrashResourceType.FILE) {
      return this.purgeFile(ownerId, owner, id);
    }

    return this.purgeFolder(ownerId, owner, id);
  }

  /**
   * DELETE /api/trash
   *
   * Vacía la papelera del usuario. Incluye las raíces borradas y, para cada
   * carpeta, todo su subárbol físico. Se registra un único `TRASH_EMPTY` con
   * contadores y `batchId`, antes de borrar los datos.
   */
  async empty(ownerId: string): Promise<PurgeResult> {
    const owner = new Types.ObjectId(ownerId);

    // Carpetas en papelera: sus raíces y descendientes definen los subárboles
    // que deben desaparecer completos.
    const deletedFolders = await this.folderModel
      .find({ ownerId: owner, isDeleted: true })
      .select('_id')
      .exec();
    const deletedFolderIds = deletedFolders.map((folder) => folder._id);

    const folders =
      deletedFolderIds.length > 0
        ? await this.folderModel
            .find({
              ownerId: owner,
              $or: [
                { _id: { $in: deletedFolderIds } },
                { ancestors: { $in: deletedFolderIds } },
              ],
            })
            .exec()
        : [];

    const folderIds = folders.map((folder) => folder._id);

    // Archivos: los que están en papelera por derecho propio más todos los
    // que viven dentro de un subárbol de carpeta borrada.
    const fileFilter: QueryFilter<File> =
      folderIds.length > 0
        ? {
            ownerId: owner,
            $or: [{ isDeleted: true }, { folderId: { $in: folderIds } }],
          }
        : { ownerId: owner, isDeleted: true };

    const files = await this.fileModel.find(fileFilter).exec();

    const freedBytes = this.sumSizes(files);
    const batchId = randomUUID();

    // Destructivo: primero el log, con el nombre y los contadores ya conocidos.
    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.TRASH_EMPTY,
      resourceType: ActivityResourceType.SYSTEM,
      resourceId: null,
      resourceName: 'Papelera',
      metadata: {
        batchId,
        affectedFolders: folders.length,
        affectedFiles: files.length,
        freedBytes,
      },
    });

    await this.purgeResources(owner, folderIds, files);

    return {
      type: 'trash',
      resourceId: null,
      name: 'Papelera',
      affectedFolders: folders.length,
      affectedFiles: files.length,
      freedBytes,
      batchId,
    };
  }

  /** Restaura un archivo suelto, validando padre activo y nombre disponible. */
  private async restoreFile(
    actorId: string,
    owner: Types.ObjectId,
    fileId: Types.ObjectId,
  ): Promise<FileDocument> {
    const file = await this.fileModel
      .findOne({ _id: fileId, ownerId: owner, isDeleted: true })
      .exec();

    if (!file) {
      throw new NotFoundException('Archivo no encontrado en la papelera');
    }

    await this.assertParentActive(owner, file.folderId);
    await this.ensureRestoreNameAvailable(
      TrashResourceType.FILE,
      owner,
      file.folderId,
      file.name,
      file._id,
    );

    try {
      const restored = await this.fileModel
        .findOneAndUpdate(
          { _id: file._id, ownerId: owner, isDeleted: true },
          { $set: RESTORE_FIELDS },
          { returnDocument: 'after' },
        )
        .exec();

      if (!restored) {
        throw new NotFoundException('Archivo no encontrado en la papelera');
      }

      // Reversible: el log se escribe cuando el archivo ya está activo.
      await this.activityService.log({
        actorId,
        action: ActivityAction.FILE_RESTORE,
        resourceType: ActivityResourceType.FILE,
        resourceId: restored._id,
        resourceName: restored.name,
        metadata: { parentId: restored.folderId },
      });

      return restored;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe un archivo con ese nombre en la carpeta',
        );
      }
      throw error;
    }
  }

  /** Restaura una carpeta y toda la cascada agrupada por su `deletedRootId`. */
  private async restoreFolder(
    actorId: string,
    owner: Types.ObjectId,
    folderId: Types.ObjectId,
  ): Promise<FolderDocument> {
    const folder = await this.folderModel
      .findOne({ _id: folderId, ownerId: owner, isDeleted: true })
      .exec();

    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada en la papelera');
    }

    await this.assertParentActive(owner, folder.parentId);
    await this.ensureRestoreNameAvailable(
      TrashResourceType.FOLDER,
      owner,
      folder.parentId,
      folder.name,
      folder._id,
    );

    try {
      // La raíz coincide con `deletedRootId = su propio _id`, por eso el mismo
      // filtro restaura la carpeta y los descendientes de esa cascada.
      const [foldersResult, filesResult] = await Promise.all([
        this.folderModel
          .updateMany(
            {
              ownerId: owner,
              isDeleted: true,
              $or: [{ _id: folder._id }, { deletedRootId: folder._id }],
            },
            { $set: RESTORE_FIELDS },
          )
          .exec(),
        this.fileModel
          .updateMany(
            {
              ownerId: owner,
              isDeleted: true,
              deletedRootId: folder._id,
            },
            { $set: RESTORE_FIELDS },
          )
          .exec(),
      ]);

      const restored = await this.folderModel.findById(folder._id).exec();
      if (!restored) {
        throw new NotFoundException('Carpeta no encontrada en la papelera');
      }

      await this.activityService.log({
        actorId,
        action: ActivityAction.FOLDER_RESTORE,
        resourceType: ActivityResourceType.FOLDER,
        resourceId: restored._id,
        resourceName: restored.name,
        metadata: {
          parentId: restored.parentId,
          affectedFolders: foldersResult.modifiedCount,
          affectedFiles: filesResult.modifiedCount,
        },
      });

      return restored;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe una carpeta con ese nombre entre las hermanas activas',
        );
      }
      throw error;
    }
  }

  /** Purga un archivo: log previo, GridFS, shares, documento y storageUsed. */
  private async purgeFile(
    actorId: string,
    owner: Types.ObjectId,
    fileId: Types.ObjectId,
  ): Promise<PurgeResult> {
    const file = await this.fileModel
      .findOne({ _id: fileId, ownerId: owner, isDeleted: true })
      .exec();

    if (!file) {
      throw new NotFoundException('Archivo no encontrado en la papelera');
    }

    const batchId = randomUUID();
    const freedBytes = file.size;

    // PRIMERO el log: es el último momento en que se conoce el nombre y el
    // contexto del recurso. Si la purga falla después, el evento queda como
    // rastro y la operación puede reintentarse.
    await this.activityService.log({
      actorId,
      action: ActivityAction.FILE_PURGE,
      resourceType: ActivityResourceType.FILE,
      resourceId: file._id,
      resourceName: file.name,
      metadata: {
        batchId,
        parentId: file.folderId,
        extension: file.extension,
        affectedFolders: 0,
        affectedFiles: 1,
        freedBytes,
      },
    });

    await this.purgeResources(owner, [], [file]);

    return {
      type: TrashResourceType.FILE,
      resourceId: file._id,
      name: file.name,
      affectedFolders: 0,
      affectedFiles: 1,
      freedBytes,
      batchId,
    };
  }

  /** Purga una carpeta con todo su subárbol físico y los archivos que contiene. */
  private async purgeFolder(
    actorId: string,
    owner: Types.ObjectId,
    folderId: Types.ObjectId,
  ): Promise<PurgeResult> {
    const folder = await this.folderModel
      .findOne({ _id: folderId, ownerId: owner, isDeleted: true })
      .exec();

    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada en la papelera');
    }

    // Se incluyen todos los descendientes, aunque alguno hubiera sido borrado
    // antes por separado: purgar la carpeta hace desaparecer el subárbol.
    const folders = await this.folderModel
      .find({
        ownerId: owner,
        $or: [{ _id: folder._id }, { ancestors: folder._id }],
      })
      .exec();
    const folderIds = folders.map((item) => item._id);

    // Todos los archivos del subárbol, sin filtrar por `isDeleted`, para no
    // dejar metadatos huérfanos al eliminar las carpetas.
    const files = await this.fileModel
      .find({ ownerId: owner, folderId: { $in: folderIds } })
      .exec();

    const freedBytes = this.sumSizes(files);
    const batchId = randomUUID();

    // PRIMERO el log, con los contadores de toda la cascada.
    await this.activityService.log({
      actorId,
      action: ActivityAction.FOLDER_PURGE,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: folder._id,
      resourceName: folder.name,
      metadata: {
        batchId,
        parentId: folder.parentId,
        affectedFolders: folders.length,
        affectedFiles: files.length,
        freedBytes,
      },
    });

    await this.purgeResources(owner, folderIds, files);

    return {
      type: TrashResourceType.FOLDER,
      resourceId: folder._id,
      name: folder.name,
      affectedFolders: folders.length,
      affectedFiles: files.length,
      freedBytes,
      batchId,
    };
  }

  /**
   * Destrucción física compartida por purga individual y vaciado.
   *
   * Orden: binarios de GridFS (chunks y después files), comparticiones,
   * documentos y, al final, `storageUsed` con `$inc` atómico. Todos los pasos
   * son idempotentes (`deleteMany` por id).
   */
  private async purgeResources(
    owner: Types.ObjectId,
    folderIds: Types.ObjectId[],
    files: FileDocument[],
  ): Promise<void> {
    const fileIds = files.map((file) => file._id);
    const gridFsIds = files.map((file) => file.gridFsId);
    const freedBytes = this.sumSizes(files);

    if (gridFsIds.length > 0) {
      await this.deleteGridFsBinaries(gridFsIds);
    }

    // Comparticiones de todos los recursos afectados. Se resuelven por id,
    // sin importar el tipo de acceso concedido.
    const shareConditions: QueryFilter<Share>[] = [];
    if (fileIds.length > 0) {
      shareConditions.push({
        resourceType: ShareResourceType.FILE,
        resourceId: { $in: fileIds },
      });
    }
    if (folderIds.length > 0) {
      shareConditions.push({
        resourceType: ShareResourceType.FOLDER,
        resourceId: { $in: folderIds },
      });
    }
    if (shareConditions.length > 0) {
      await this.shareModel.deleteMany({ $or: shareConditions }).exec();
    }

    if (fileIds.length > 0) {
      await this.fileModel
        .deleteMany({ _id: { $in: fileIds }, ownerId: owner })
        .exec();
    }
    if (folderIds.length > 0) {
      await this.folderModel
        .deleteMany({ _id: { $in: folderIds }, ownerId: owner })
        .exec();
    }

    // Único punto donde baja el almacenamiento: el binario ya no existe.
    if (freedBytes > 0) {
      await this.userModel
        .updateOne({ _id: owner }, { $inc: { storageUsed: -freedBytes } })
        .exec();
    }
  }

  /**
   * Borra los binarios de GridFS. Se eliminan primero `fs.chunks` y luego
   * `fs.files`, igual que hace el driver, pero con `deleteMany` para que la
   * operación sea idempotente y cubra también chunks huérfanos.
   */
  private async deleteGridFsBinaries(
    gridFsIds: Types.ObjectId[],
  ): Promise<void> {
    const db = this.connection.db;
    if (!db) {
      throw new ServiceUnavailableException('Base de datos no disponible');
    }

    await db
      .collection('fs.chunks')
      .deleteMany({ files_id: { $in: gridFsIds } });
    await db.collection('fs.files').deleteMany({ _id: { $in: gridFsIds } });
  }

  /** El padre debe existir y estar activo; si no, 409. */
  private async assertParentActive(
    owner: Types.ObjectId,
    parentId: Types.ObjectId | null,
  ): Promise<void> {
    if (!parentId) {
      // La raíz del usuario siempre está activa.
      return;
    }

    const parent = await this.folderModel
      .findOne({ _id: parentId, ownerId: owner, isDeleted: false })
      .select('_id')
      .exec();

    if (!parent) {
      throw new ConflictException(
        'No se puede restaurar: la carpeta padre no está activa',
      );
    }
  }

  /** Valida que no exista un hermano activo con el mismo nombre. */
  private async ensureRestoreNameAvailable(
    type: TrashResourceType,
    owner: Types.ObjectId,
    parentId: Types.ObjectId | null,
    name: string,
    excludeId: Types.ObjectId,
  ): Promise<void> {
    if (type === TrashResourceType.FILE) {
      const exists = await this.fileModel.exists({
        ownerId: owner,
        folderId: parentId,
        name,
        isDeleted: false,
        _id: { $ne: excludeId },
      });
      if (exists) {
        throw new ConflictException(
          'Ya existe un archivo con ese nombre en la carpeta',
        );
      }
      return;
    }

    const exists = await this.folderModel.exists({
      ownerId: owner,
      parentId,
      name,
      isDeleted: false,
      _id: { $ne: excludeId },
    });
    if (exists) {
      throw new ConflictException(
        'Ya existe una carpeta con ese nombre entre las hermanas activas',
      );
    }
  }

  private sumSizes(files: Array<{ size: number }>): number {
    return files.reduce((total, file) => total + file.size, 0);
  }

  private parseType(type: string): TrashResourceType {
    const normalized = type?.toLowerCase();
    if (normalized === TrashResourceType.FILE) {
      return TrashResourceType.FILE;
    }
    if (normalized === TrashResourceType.FOLDER) {
      return TrashResourceType.FOLDER;
    }
    throw new BadRequestException('type debe ser "file" o "folder"');
  }

  private parseId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Recurso no encontrado');
    }
    return new Types.ObjectId(id);
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
