import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Model,
  Types,
  type PipelineStage,
  type QueryFilter,
} from 'mongoose';

import {
  ActivityLog,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import type { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface.js';
import { File } from '../files/schemas/file.schema.js';
import {
  Share,
  ShareResourceType,
  type ShareAccess,
} from '../shares/schemas/share.schema.js';
import { UserRole } from '../users/schemas/user.schema.js';
import type { DateRangeQueryDto } from './dto/date-range-query.dto.js';
import type { OperationsByPeriodQueryDto } from './dto/operations-by-period-query.dto.js';
import type { UserActivityQueryDto } from './dto/user-activity-query.dto.js';
import type { UserScopeQueryDto } from './dto/user-scope-query.dto.js';

/** Filtro de archivos con `createdAt`, que no es una propiedad del esquema. */
type FileFilter = QueryFilter<File> & {
  createdAt?: { $gte?: Date; $lte?: Date };
};

/** Filtro de actividad con `createdAt`, que no es una propiedad del esquema. */
type ActivityFilter = QueryFilter<ActivityLog> & {
  createdAt?: { $gte?: Date; $lte?: Date };
};

/** Datos públicos mínimos de un usuario relacionado con un recurso. */
export interface ReportUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
}

/** Fila del reporte 1: archivos agrupados por extensión. */
export interface FilesByTypeRow {
  extension: string;
  count: number;
  totalSize: number;
}

/** Fila del reporte 2: archivo creado dentro del rango consultado. */
export interface FileRangeRow {
  _id: Types.ObjectId;
  name: string;
  extension: string;
  size: number;
  ownerId: Types.ObjectId;
  folderId: Types.ObjectId | null;
  createdAt: Date;
}

/** Fila del reporte 3: archivo y cantidad de eventos registrados. */
export interface FileOperationsRow {
  resourceId: Types.ObjectId;
  resourceName: string;
  operations: number;
}

/** Fila del reporte 4: usuario y cantidad de archivos vivos. */
export interface TopUserFilesRow {
  userId: Types.ObjectId;
  name: string;
  email: string | null;
  files: number;
  totalSize: number;
}

/** Fila del reporte 5: usuario y recursos que ha compartido. */
export interface UserSharesRow {
  userId: Types.ObjectId;
  name: string;
  email: string | null;
  shares: number;
  sharedResources: number;
}

/** Fila del reporte 6: archivo compartido con más usuarios. */
export interface FileSharedUsersRow {
  fileId: Types.ObjectId;
  name: string;
  extension: string;
  ownerId: Types.ObjectId;
  ownerName: string;
  sharedWith: number;
}

/** Fila de los reportes 7 y 8: permiso con recurso y usuarios relacionados. */
export interface ShareResourceRow {
  shareId: Types.ObjectId;
  resourceType: ShareResourceType;
  resourceId: Types.ObjectId;
  resourceName: string;
  access: ShareAccess;
  owner: ReportUser;
  grantee: ReportUser;
  createdAt: Date;
  updatedAt: Date;
}

/** Fila del reporte 9: evento del historial de un usuario. */
export interface UserActivityRow {
  _id: Types.ObjectId;
  actorId: Types.ObjectId | null;
  actorName: string;
  actorRole: UserRole | null;
  action: string;
  resourceType: string;
  resourceId: Types.ObjectId | null;
  resourceName: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

/** Fila del reporte 10: operaciones agrupadas por acción. */
export interface OperationsByTypeRow {
  action: string;
  count: number;
}

/** Fila del reporte 11: operaciones agrupadas por período. */
export interface OperationsByPeriodRow {
  period: Date;
  count: number;
}

/** Fila del reporte 12: principales combinaciones acción/tipo de recurso. */
export interface TopActionRow {
  action: string;
  resourceType: string;
  count: number;
}

/** Fila del reporte 13: archivo vivo sin ningún permiso efectivo. */
export interface FileNeverSharedRow {
  _id: Types.ObjectId;
  name: string;
  extension: string;
  size: number;
  ownerId: Types.ObjectId;
  ownerName: string;
  createdAt: Date;
}

/** Fila del reporte 14: carpeta viva y cantidad de archivos directos. */
export interface FolderMostFilesRow {
  folderId: Types.ObjectId;
  name: string;
  ownerId: Types.ObjectId;
  ownerName: string;
  files: number;
}

/**
 * Reportes analíticos bajo `/api/reports`.
 *
 * Todos los cálculos se resuelven con aggregation pipelines de MongoDB: no se
 * traen documentos para contarlos o agruparlos en JavaScript. Cada método
 * aplica el alcance del usuario autenticado:
 *
 * - `ADMIN`: datos globales y de cualquier usuario.
 * - `USER`: solo sus propios datos. Los reportes de archivos se filtran por
 *   `ownerId` y los de actividad por `actorId`.
 *
 * Los reportes de recursos vivos excluyen `isDeleted: true`. Los reportes de
 * auditoría no filtran recursos existentes: usan `resourceName` como snapshot
 * para que el historial siga siendo válido aunque el recurso haya sido purgado.
 */
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    @InjectModel(Share.name)
    private readonly shareModel: Model<Share>,
    @InjectModel(ActivityLog.name)
    private readonly activityModel: Model<ActivityLog>,
  ) {}

  /** Reporte 1 — cantidad y tamaño de archivos vivos por extensión. */
  async filesByType(
    requester: AuthenticatedUser,
  ): Promise<FilesByTypeRow[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          ...this.fileOwnerScope(requester),
        },
      },
      {
        $group: {
          _id: '$extension',
          count: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
      {
        $project: {
          _id: 0,
          extension: '$_id',
          count: 1,
          totalSize: 1,
        },
      },
      { $sort: { extension: 1 } },
    ];

    return this.fileModel.aggregate<FilesByTypeRow>(pipeline).exec();
  }

  /** Reporte 2 — archivos vivos creados dentro de un rango de fechas. */
  async filesByDateRange(
    requester: AuthenticatedUser,
    query: DateRangeQueryDto,
  ): Promise<FileRangeRow[]> {
    const { from, to } = this.parseDateRange(query);
    const match: FileFilter = {
      isDeleted: false,
      ...this.fileOwnerScope(requester),
    };

    if (from || to) {
      match.createdAt = {};
      if (from) {
        match.createdAt.$gte = from;
      }
      if (to) {
        match.createdAt.$lte = to;
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $project: {
          _id: 1,
          name: 1,
          extension: 1,
          size: 1,
          ownerId: 1,
          folderId: 1,
          createdAt: 1,
        },
      },
      // El segundo criterio hace estable el orden cuando comparten timestamp.
      { $sort: { createdAt: -1, _id: -1 } },
    ];

    return this.fileModel.aggregate<FileRangeRow>(pipeline).exec();
  }

  /**
   * Reporte 3 — archivos con más eventos.
   *
   * Se agrupa `activity_log` por `resourceId` y se conserva `resourceName`
   * como snapshot. No se hace `$lookup` a `files`: el recurso pudo haberse
   * purgado y el historial debe seguir siendo legible.
   */
  async filesMostOperations(
    requester: AuthenticatedUser,
  ): Promise<FileOperationsRow[]> {
    const match: ActivityFilter = {
      resourceType: ActivityResourceType.FILE,
      resourceId: { $ne: null },
      ...this.activityActorScope(requester),
    };

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $group: {
          _id: '$resourceId',
          resourceName: { $first: '$resourceName' },
          operations: { $sum: 1 },
        },
      },
      { $sort: { operations: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          resourceId: '$_id',
          resourceName: 1,
          operations: 1,
        },
      },
    ];

    return this.activityModel
      .aggregate<FileOperationsRow>(pipeline)
      .exec();
  }

  /** Reporte 4 — top 10 de usuarios por cantidad de archivos vivos. */
  async topUsersByFiles(
    requester: AuthenticatedUser,
  ): Promise<TopUserFilesRow[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          ...this.fileOwnerScope(requester),
        },
      },
      {
        $group: {
          _id: '$ownerId',
          files: { $sum: 1 },
          totalSize: { $sum: '$size' },
        },
      },
      { $sort: { files: -1, totalSize: -1, _id: 1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: { $ifNull: ['$user.name', 'Usuario eliminado'] },
          email: { $ifNull: ['$user.email', null] },
          files: 1,
          totalSize: 1,
        },
      },
    ];

    return this.fileModel.aggregate<TopUserFilesRow>(pipeline).exec();
  }

  /**
   * Reporte 5 — usuarios con más recursos compartidos.
   *
   * Se cuenta tanto el número de permisos (`shares`) como el de recursos
   * distintos (`sharedResources`). Solo se consideran recursos vivos: se
   * descartan los shares de archivos o carpetas en papelera.
   */
  async usersMostShared(
    requester: AuthenticatedUser,
  ): Promise<UserSharesRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.shareOwnerScope(requester) },
      ...this.liveResourceLookups(),
      this.liveResourceMatch(),
      {
        $group: {
          _id: '$ownerId',
          shares: { $sum: 1 },
          // `$addToSet` evita contar dos veces el mismo recurso compartido con
          // varios destinatarios.
          resources: {
            $addToSet: {
              resourceType: '$resourceType',
              resourceId: '$resourceId',
            },
          },
        },
      },
      {
        $project: {
          _id: 1,
          shares: 1,
          sharedResources: { $size: '$resources' },
        },
      },
      { $sort: { sharedResources: -1, shares: -1, _id: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: { $ifNull: ['$user.name', 'Usuario eliminado'] },
          email: { $ifNull: ['$user.email', null] },
          shares: 1,
          sharedResources: 1,
        },
      },
    ];

    return this.shareModel.aggregate<UserSharesRow>(pipeline).exec();
  }

  /** Reporte 6 — archivos vivos compartidos con más usuarios distintos. */
  async filesMostShared(
    requester: AuthenticatedUser,
  ): Promise<FileSharedUsersRow[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          resourceType: ShareResourceType.FILE,
          ...this.shareOwnerScope(requester),
        },
      },
      {
        $lookup: {
          from: 'files',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'file',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { name: 1, extension: 1, ownerId: 1 } },
          ],
        },
      },
      // Descarta shares huérfanos o de archivos en papelera.
      { $unwind: '$file' },
      {
        $group: {
          _id: '$resourceId',
          file: { $first: '$file' },
          sharedWith: { $addToSet: '$granteeId' },
        },
      },
      {
        $project: {
          _id: 1,
          file: 1,
          sharedWith: { $size: '$sharedWith' },
        },
      },
      { $sort: { sharedWith: -1, _id: 1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'file.ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      {
        $unwind: {
          path: '$owner',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          fileId: '$_id',
          name: '$file.name',
          extension: '$file.extension',
          ownerId: '$file.ownerId',
          ownerName: { $ifNull: ['$owner.name', 'Usuario eliminado'] },
          sharedWith: 1,
        },
      },
    ];

    return this.shareModel
      .aggregate<FileSharedUsersRow>(pipeline)
      .exec();
  }

  /** Reporte 7 — recursos que un usuario ha compartido. */
  async sharedByUser(
    requester: AuthenticatedUser,
    query: UserScopeQueryDto,
  ): Promise<ShareResourceRow[]> {
    const ownerId = this.resolveTargetUser(requester, query.userId);

    return this.findSharedResources({ ownerId });
  }

  /** Reporte 8 — recursos que un usuario ha recibido. */
  async receivedByUser(
    requester: AuthenticatedUser,
    query: UserScopeQueryDto,
  ): Promise<ShareResourceRow[]> {
    const granteeId = this.resolveTargetUser(requester, query.userId);

    return this.findSharedResources({ granteeId });
  }

  /** Reporte 9 — historial de un usuario, filtrado por rango de fechas. */
  async userActivity(
    requester: AuthenticatedUser,
    query: UserActivityQueryDto,
  ): Promise<UserActivityRow[]> {
    const actorId = this.resolveTargetUser(requester, query.userId);
    const { from, to } = this.parseDateRange(query);
    const match: ActivityFilter = { actorId };

    if (from || to) {
      match.createdAt = {};
      if (from) {
        match.createdAt.$gte = from;
      }
      if (to) {
        match.createdAt.$lte = to;
      }
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      { $sort: { createdAt: -1, _id: -1 } },
    ];

    return this.activityModel.aggregate<UserActivityRow>(pipeline).exec();
  }

  /** Reporte 10 — operaciones agrupadas por acción. */
  async operationsByType(
    requester: AuthenticatedUser,
  ): Promise<OperationsByTypeRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.activityActorScope(requester) },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1, _id: 1 } },
      {
        $project: {
          _id: 0,
          action: '$_id',
          count: 1,
        },
      },
    ];

    return this.activityModel
      .aggregate<OperationsByTypeRow>(pipeline)
      .exec();
  }

  /**
   * Reporte 11 — operaciones agrupadas por día o mes.
   *
   * `$dateTrunc` agrupa en UTC para que el resultado no dependa de la zona
   * horaria del servidor.
   */
  async operationsByPeriod(
    requester: AuthenticatedUser,
    query: OperationsByPeriodQueryDto,
  ): Promise<OperationsByPeriodRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.activityActorScope(requester) },
      {
        $group: {
          _id: {
            $dateTrunc: {
              date: '$createdAt',
              unit: query.granularity,
              timezone: 'UTC',
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          period: '$_id',
          count: 1,
        },
      },
    ];

    return this.activityModel
      .aggregate<OperationsByPeriodRow>(pipeline)
      .exec();
  }

  /** Reporte 12 — top 10 de acciones, desglosadas por tipo de recurso. */
  async topActions(
    requester: AuthenticatedUser,
  ): Promise<TopActionRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: this.activityActorScope(requester) },
      {
        $group: {
          _id: {
            action: '$action',
            resourceType: '$resourceType',
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: {
          count: -1,
          '_id.action': 1,
          '_id.resourceType': 1,
        },
      },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          action: '$_id.action',
          resourceType: '$_id.resourceType',
          count: 1,
        },
      },
    ];

    return this.activityModel.aggregate<TopActionRow>(pipeline).exec();
  }

  /**
   * Reporte 13 — archivos vivos sin ningún permiso: ni un share directo del
   * archivo (`resourceType: FILE`) ni un share heredado de su carpeta o de
   * `folder.ancestors` (`resourceType: FOLDER`).
   *
   * La herencia replica la regla de `AccessService`: un permiso sobre una
   * carpeta alcanza a todo su contenido actual y futuro, sin copiar documentos
   * a cada archivo. Por eso el reporte debe mirar la cadena completa de
   * ancestros de la carpeta contenedora, no solo el share directo.
   *
   * `$lookup` trae únicamente los ancestros de la carpeta viva del archivo y
   * un segundo `$lookup` con `$expr` comprueba en una sola consulta si existe
   * algún permiso directo o heredado. Un archivo suelto (`folderId: null`) no
   * puede heredar permisos.
   */
  async filesNeverShared(
    requester: AuthenticatedUser,
  ): Promise<FileNeverSharedRow[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          ...this.fileOwnerScope(requester),
        },
      },
      {
        $lookup: {
          from: 'folders',
          localField: 'folderId',
          foreignField: '_id',
          as: 'folder',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { ancestors: 1 } },
          ],
        },
      },
      // `preserveNullAndEmptyArrays` mantiene los archivos sin carpeta.
      { $unwind: { path: '$folder', preserveNullAndEmptyArrays: true } },
      {
        $set: {
          /*
           * Ids que pueden otorgar acceso heredado: la carpeta contenedora y
           * todos sus ancestros. Si el archivo está en la raíz o su carpeta no
           * existe/está en papelera, el array queda vacío.
           */
          folderIds: {
            $cond: [
              { $eq: [{ $type: '$folder' }, 'object'] },
              {
                $concatArrays: [
                  ['$folderId'],
                  { $ifNull: ['$folder.ancestors', []] },
                ],
              },
              [],
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'shares',
          let: { fileId: '$_id', folderIds: '$folderIds' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    {
                      $and: [
                        { $eq: ['$resourceType', ShareResourceType.FILE] },
                        { $eq: ['$resourceId', '$$fileId'] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ['$resourceType', ShareResourceType.FOLDER] },
                        { $in: ['$resourceId', '$$folderIds'] },
                      ],
                    },
                  ],
                },
              },
            },
            // Solo interesa saber si hay al menos un permiso.
            { $limit: 1 },
            { $project: { _id: 1 } },
          ],
          as: 'permissions',
        },
      },
      { $match: { permissions: { $size: 0 } } },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      {
        $unwind: {
          path: '$owner',
          preserveNullAndEmptyArrays: true,
        },
      },
      // Mismo desempate que el resto de reportes de archivos.
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $project: {
          _id: 1,
          name: 1,
          extension: 1,
          size: 1,
          ownerId: 1,
          ownerName: { $ifNull: ['$owner.name', 'Usuario eliminado'] },
          createdAt: 1,
        },
      },
    ];

    return this.fileModel.aggregate<FileNeverSharedRow>(pipeline).exec();
  }

  /**
   * Reporte 14 — top 10 de carpetas vivas por cantidad de archivos vivos
   * directos (los que tienen `folderId` igual al `_id` de la carpeta).
   *
   * Se parte de `files` porque el índice `{ folderId, isDeleted, name }`
   * resuelve el agrupamiento sin recorrer las carpetas sin contenido. El
   * `$lookup` posterior descarta carpetas en papelera y resuelve su dueño.
   * No se cuentan archivos de subcarpetas: "directos" excluye descendientes.
   */
  async foldersMostFiles(
    requester: AuthenticatedUser,
  ): Promise<FolderMostFilesRow[]> {
    const pipeline: PipelineStage[] = [
      {
        $match: {
          isDeleted: false,
          folderId: { $ne: null },
          ...this.fileOwnerScope(requester),
        },
      },
      {
        $group: {
          _id: '$folderId',
          files: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'folders',
          localField: '_id',
          foreignField: '_id',
          as: 'folder',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { name: 1, ownerId: 1 } },
          ],
        },
      },
      // Descarta carpetas huérfanas o en papelera.
      { $unwind: '$folder' },
      { $sort: { files: -1, 'folder.name': 1, _id: 1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: 'folder.ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      {
        $unwind: {
          path: '$owner',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          folderId: '$_id',
          name: '$folder.name',
          ownerId: '$folder.ownerId',
          ownerName: { $ifNull: ['$owner.name', 'Usuario eliminado'] },
          files: 1,
        },
      },
    ];

    return this.fileModel.aggregate<FolderMostFilesRow>(pipeline).exec();
  }

  /**
   * Resuelve el usuario objetivo de un reporte por usuario.
   *
   * Un `USER` solo puede consultar su propio id; intentar ver otro usuario
   * devuelve 403. Si no se envía `userId`, se usa el usuario autenticado.
   */
  private resolveTargetUser(
    requester: AuthenticatedUser,
    requestedId?: string,
  ): Types.ObjectId {
    const target = new Types.ObjectId(requestedId ?? requester.id);

    if (
      requester.role !== UserRole.ADMIN &&
      !target.equals(new Types.ObjectId(requester.id))
    ) {
      throw new ForbiddenException(
        'No puedes consultar datos de otro usuario',
      );
    }

    return target;
  }

  /** Alcance de archivos: global para ADMIN, propio para USER. */
  private fileOwnerScope(requester: AuthenticatedUser): QueryFilter<File> {
    return requester.role === UserRole.ADMIN
      ? {}
      : { ownerId: new Types.ObjectId(requester.id) };
  }

  /** Alcance de comparticiones: global para ADMIN, propias para USER. */
  private shareOwnerScope(requester: AuthenticatedUser): QueryFilter<Share> {
    return requester.role === UserRole.ADMIN
      ? {}
      : { ownerId: new Types.ObjectId(requester.id) };
  }

  /** Alcance de actividad: global para ADMIN, propio para USER. */
  private activityActorScope(
    requester: AuthenticatedUser,
  ): QueryFilter<ActivityLog> {
    return requester.role === UserRole.ADMIN
      ? {}
      : { actorId: new Types.ObjectId(requester.id) };
  }

  /** Convierte y valida `from`/`to`; el rango es inclusivo en UTC. */
  private parseDateRange(query: DateRangeQueryDto): {
    from?: Date;
    to?: Date;
  } {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && Number.isNaN(from.getTime())) {
      throw new BadRequestException('from debe ser una fecha válida');
    }
    if (to && Number.isNaN(to.getTime())) {
      throw new BadRequestException('to debe ser una fecha válida');
    }
    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'from no puede ser posterior a to',
      );
    }

    return { from, to };
  }

  /**
   * `$lookup` de las dos colecciones de recursos. La pipeline interna filtra
   * recursos vivos antes de traerlos al documento del share.
   */
  private liveResourceLookups(): PipelineStage[] {
    return [
      {
        $lookup: {
          from: 'files',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'file',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { _id: 1 } },
          ],
        },
      },
      {
        $lookup: {
          from: 'folders',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'folder',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { _id: 1 } },
          ],
        },
      },
    ];
  }

  /**
   * Conserva solo shares cuyo recurso polimórfico existe y está activo.
   * Si el lookup no encontró el recurso, el array correspondiente está vacío.
   */
  private liveResourceMatch(): PipelineStage {
    return {
      $match: {
        $expr: {
          $or: [
            {
              $and: [
                { $eq: ['$resourceType', ShareResourceType.FILE] },
                { $gt: [{ $size: '$file' }, 0] },
              ],
            },
            {
              $and: [
                { $eq: ['$resourceType', ShareResourceType.FOLDER] },
                { $gt: [{ $size: '$folder' }, 0] },
              ],
            },
          ],
        },
      },
    };
  }

  /**
   * Pipeline común de los reportes 7 y 8: resuelve el recurso polimórfico y
   * los datos de dueño/destinatario. Solo devuelve recursos vivos.
   */
  private async findSharedResources(
    filter: { ownerId?: Types.ObjectId; granteeId?: Types.ObjectId },
  ): Promise<ShareResourceRow[]> {
    const pipeline: PipelineStage[] = [
      { $match: filter },
      {
        $lookup: {
          from: 'files',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'file',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { name: 1 } },
          ],
        },
      },
      {
        $lookup: {
          from: 'folders',
          localField: 'resourceId',
          foreignField: '_id',
          as: 'folder',
          pipeline: [
            { $match: { isDeleted: false } },
            { $project: { name: 1 } },
          ],
        },
      },
      {
        $set: {
          resource: {
            $cond: [
              { $eq: ['$resourceType', ShareResourceType.FILE] },
              { $arrayElemAt: ['$file', 0] },
              { $arrayElemAt: ['$folder', 0] },
            ],
          },
        },
      },
      { $match: { 'resource._id': { $exists: true } } },
      {
        $lookup: {
          from: 'users',
          localField: 'ownerId',
          foreignField: '_id',
          as: 'owner',
        },
      },
      { $unwind: '$owner' },
      {
        $lookup: {
          from: 'users',
          localField: 'granteeId',
          foreignField: '_id',
          as: 'grantee',
        },
      },
      { $unwind: '$grantee' },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $project: {
          _id: 0,
          shareId: '$_id',
          resourceType: 1,
          resourceId: 1,
          resourceName: '$resource.name',
          access: 1,
          owner: {
            _id: '$owner._id',
            name: '$owner.name',
            email: '$owner.email',
          },
          grantee: {
            _id: '$grantee._id',
            name: '$grantee.name',
            email: '$grantee.email',
          },
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    return this.shareModel.aggregate<ShareResourceRow>(pipeline).exec();
  }
}
