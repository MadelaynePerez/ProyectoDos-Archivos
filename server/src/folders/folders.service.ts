import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';
import { Model, Types, type QueryFilter } from 'mongoose';

import {
  ActivityAction,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { File } from '../files/schemas/file.schema.js';
import { AccessService, EffectiveAccess } from '../shares/access.service.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { MoveFolderDto } from './dto/move-folder.dto.js';
import { RenameFolderDto } from './dto/rename-folder.dto.js';
import { Folder, type FolderDocument } from './schemas/folder.schema.js';

/**
 * Profundidad máxima del árbol. La cadena `ancestors` está acotada por este
 * valor, por eso puede embeberse sin riesgo de superar el límite del documento.
 */
const MAX_DEPTH = 100;

/**
 * Reglas de jerarquía de `folders`:
 *
 * - Raíz: `parentId = null`, `ancestors = []`, `depth = 0`.
 * - Hija: `ancestors = [...padre.ancestors, padre._id]`, `depth = padre.depth + 1`.
 * - La cadena nunca contiene a la propia carpeta, así que no puede haber ciclos.
 * - Una carpeta solo puede vivir dentro de un árbol de su mismo `ownerId`.
 *
 * Las operaciones estructurales (crear, mover, eliminar) se filtran siempre por
 * `ownerId`. Listar y renombrar aceptan además shares: `READ` para listar el
 * contenido y `EDIT` para renombrar, resueltos por `AccessService`. Una carpeta
 * sin acceso se trata como inexistente (404), nunca como prohibida (403), para
 * no revelar que existe.
 */
@Injectable()
export class FoldersService {
  constructor(
    @InjectModel(Folder.name)
    private readonly folderModel: Model<Folder>,
    // Se usa únicamente para propagar el soft delete de una carpeta a sus
    // archivos; el TrashModule consume estos modelos directamente.
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    private readonly activityService: ActivityService,
    private readonly accessService: AccessService,
  ) {}

  /** Crea una carpeta en la raíz o dentro de un padre activo del mismo dueño. */
  async create(
    ownerId: string,
    dto: CreateFolderDto,
  ): Promise<FolderDocument> {
    const owner = new Types.ObjectId(ownerId);
    const parent = dto.parentId
      ? await this.findOwnedActiveFolder(
          dto.parentId,
          owner,
          'Carpeta padre no encontrada',
        )
      : null;

    // Invariante de la jerarquía: la cadena de ancestros del padre más el
    // propio padre; la raíz arranca vacía.
    const ancestors = parent ? [...parent.ancestors, parent._id] : [];
    const depth = parent ? parent.depth + 1 : 0;

    if (depth > MAX_DEPTH) {
      throw new BadRequestException(
        `La profundidad máxima permitida es ${MAX_DEPTH}`,
      );
    }

    const name = dto.name.trim();
    await this.ensureSiblingNameAvailable(
      owner,
      parent?._id ?? null,
      name,
    );

    try {
      const folder = await this.folderModel.create({
        name,
        ownerId: owner,
        parentId: parent?._id ?? null,
        ancestors,
        depth,
      });

      // Auditoría: el nombre se copia en el evento, no se referencia.
      await this.activityService.log({
        actorId: ownerId,
        action: ActivityAction.FOLDER_CREATE,
        resourceType: ActivityResourceType.FOLDER,
        resourceId: folder._id,
        resourceName: folder.name,
        metadata: { parentId: folder.parentId },
      });

      return folder;
    } catch (error) {
      // El índice único parcial es la garantía real ante carreras entre dos
      // requests que validan el nombre al mismo tiempo.
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe una carpeta con ese nombre entre las hermanas activas',
        );
      }
      throw error;
    }
  }

  /**
   * Lista las subcarpetas activas de un padre. Si `parentId` no se envía, se
   * listan las carpetas de la raíz del usuario autenticado.
   */
  async listByParent(
    ownerId: string,
    parentId?: string,
  ): Promise<FolderDocument[]> {
    const owner = new Types.ObjectId(ownerId);
    const filter: QueryFilter<Folder> = { isDeleted: false };

    if (parentId) {
      if (!Types.ObjectId.isValid(parentId)) {
        throw new BadRequestException('parentId debe ser un ObjectId válido');
      }
      // Un invitado con READ+ puede listar las subcarpetas de una carpeta
      // compartida. Sin acceso se responde 404, igual que si no existiera.
      const { resource: parent } = await this.accessService.requireFolderAccess(
        ownerId,
        parentId,
        EffectiveAccess.READ,
      );
      filter.ownerId = parent.ownerId;
      filter.parentId = parent._id;
    } else {
      // La raíz listada siempre es la del usuario autenticado.
      filter.ownerId = owner;
      filter.parentId = null;
    }

    return this.folderModel.find(filter).sort({ name: 1 }).exec();
  }

  /** Renombra una carpeta; el nombre debe ser único entre sus hermanas activas. */
  async rename(
    userId: string,
    folderId: string,
    dto: RenameFolderDto,
  ): Promise<FolderDocument> {
    // Renombrar requiere EDIT; puede venir de un share propio o heredado de
    // un ancestro. La unicidad y el guardado se hacen sobre el dueño real.
    const { resource: folder } = await this.accessService.requireFolderAccess(
      userId,
      folderId,
      EffectiveAccess.EDIT,
    );
    const owner = folder.ownerId;
    const name = dto.name.trim();
    const previousName = folder.name;

    await this.ensureSiblingNameAvailable(
      owner,
      folder.parentId,
      name,
      folder._id,
    );

    try {
      folder.name = name;
      await folder.save();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe una carpeta con ese nombre entre las hermanas activas',
        );
      }
      throw error;
    }

    // Auditoría: se conserva el nombre anterior solo como metadata; el
    // `resourceName` es la copia del nombre nuevo en el momento del evento.
    await this.activityService.log({
      actorId: userId,
      action: ActivityAction.FOLDER_RENAME,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: folder._id,
      resourceName: folder.name,
      metadata: { previousName },
    });

    return folder;
  }

  /**
   * Mueve una carpeta y todo su subárbol.
   *
   * Validaciones:
   * - El destino no puede ser la propia carpeta ni uno de sus descendientes
   *   (si el destino tiene a la carpeta en `ancestors`, sería un ciclo).
   * - El destino debe pertenecer al mismo dueño y estar activo.
   * - No puede superarse `MAX_DEPTH` en el punto más profundo del subárbol.
   * - El nombre no puede chocar con una hermana activa del nuevo padre.
   */
  async move(
    ownerId: string,
    folderId: string,
    dto: MoveFolderDto,
  ): Promise<FolderDocument> {
    const owner = new Types.ObjectId(ownerId);
    const folder = await this.findOwnedActiveFolder(folderId, owner);
    const fromParentId = folder.parentId;

    let newParent: FolderDocument | null = null;

    if (dto.newParentId !== null) {
      if (
        !Types.ObjectId.isValid(dto.newParentId) ||
        dto.newParentId === folder._id.toString()
      ) {
        // Mover sobre sí misma es un error de la operación, no un recurso
        // ajeno; se responde 400.
        if (dto.newParentId === folder._id.toString()) {
          throw new BadRequestException(
            'No se puede mover una carpeta dentro de sí misma',
          );
        }
        throw new NotFoundException('Carpeta destino no encontrada');
      }

      newParent = await this.folderModel
        .findOne({ _id: dto.newParentId, ownerId: owner })
        .exec();

      if (!newParent) {
        // Incluye el caso de un padre de otro usuario: se responde 404 para
        // no revelar su existencia.
        throw new NotFoundException('Carpeta destino no encontrada');
      }

      if (newParent.isDeleted) {
        throw new ConflictException('La carpeta destino está en la papelera');
      }

      // Un ciclo solo es posible si el destino ya es descendiente de F, es
      // decir, si su cadena de ancestros contiene el _id de F.
      if (
        newParent.ancestors.some((ancestor) => ancestor.equals(folder._id))
      ) {
        throw new BadRequestException(
          'No se puede mover una carpeta dentro de uno de sus descendientes',
        );
      }
    }

    // Nuevo prefijo de la carpeta movida según el destino.
    const newAncestors = newParent
      ? [...newParent.ancestors, newParent._id]
      : [];
    const newDepth = newParent ? newParent.depth + 1 : 0;

    // El descendiente más profundo define si el subárbol completo cabe en
    // MAX_DEPTH después del movimiento.
    const deepestDescendant = await this.folderModel
      .findOne({ ownerId: owner, ancestors: folder._id })
      .sort({ depth: -1 })
      .select('depth')
      .exec();
    const subtreeHeight = deepestDescendant
      ? deepestDescendant.depth - folder.depth
      : 0;

    if (newDepth + subtreeHeight > MAX_DEPTH) {
      throw new BadRequestException(
        `La profundidad máxima permitida es ${MAX_DEPTH}`,
      );
    }

    const newParentId = newParent?._id ?? null;
    await this.ensureSiblingNameAvailable(
      owner,
      newParentId,
      folder.name,
      folder._id,
    );

    const depthDelta = newDepth - folder.depth;

    // Orden sin transacciones: primero la raíz del subárbol y después los
    // descendientes. Si fallara el segundo paso, `parentId` sigue siendo
    // correcto y un job de reconciliación podría recalcular `ancestors`.
    try {
      await this.folderModel
        .updateOne(
          { _id: folder._id, ownerId: owner },
          {
            $set: {
              parentId: newParentId,
              ancestors: newAncestors,
              depth: newDepth,
            },
          },
        )
        .exec();
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException(
          'Ya existe una carpeta con ese nombre entre las hermanas activas',
        );
      }
      throw error;
    }

    /*
     * Actualización de TODO el subárbol con una aggregation pipeline, sin
     * recursión en JavaScript:
     *
     * - El filtro `{ ancestors: folder._id }` alcanza a todos los descendientes
     *   a cualquier profundidad.
     * - `$indexOfArray` localiza la posición de F dentro de la cadena; el
     *   `$slice` conserva solo la parte posterior a F.
     * - `$concatArrays` antepone el nuevo prefijo (`newAncestors + F._id`).
     * - `$depth` se ajusta con el delta del movimiento.
     */
    const newPrefix = [...newAncestors, folder._id];

    await this.folderModel
      .updateMany(
        { ownerId: owner, ancestors: folder._id },
        [
          {
            $set: {
              ancestors: {
                $concatArrays: [
                  newPrefix,
                  {
                    $slice: [
                      '$ancestors',
                      {
                        $add: [
                          { $indexOfArray: ['$ancestors', folder._id] },
                          1,
                        ],
                      },
                      { $size: '$ancestors' },
                    ],
                  },
                ],
              },
              depth: { $add: ['$depth', depthDelta] },
            },
          },
        ],
        // Mongoose 9 exige esta opción para distinguir una aggregation
        // pipeline de un documento de actualización normal.
        { updatePipeline: true },
      )
      .exec();

    // Auditoría del movimiento del subárbol completo.
    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.FOLDER_MOVE,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: folder._id,
      resourceName: folder.name,
      metadata: {
        fromParentId,
        toParentId: newParentId,
        batchId: randomUUID(),
      },
    });

    const updated = await this.folderModel.findById(folder._id).exec();
    return updated ?? folder;
  }

  /**
   * Soft delete en cascada.
   *
   * La carpeta y sus descendientes ACTIVOS pasan a papelera con el mismo
   * `deletedAt`, `deletedBy` y `deletedRootId`. Los descendientes que ya
   * estaban en papelera no se tocan para que al restaurar esta carpeta no se
   * "resuciten" borrados anteriores e independientes.
   */
  async remove(
    ownerId: string,
    folderId: string,
  ): Promise<{
    folderId: string;
    name: string;
    affectedFolders: number;
    affectedFiles: number;
  }> {
    const owner = new Types.ObjectId(ownerId);
    const folder = await this.findOwnedActiveFolder(folderId, owner);
    const now = new Date();
    const deletedRootId = folder._id;

    // Se resuelve el subárbol activo por `ancestors`, sin recursión en JS.
    // Estos ids también permiten propagar el borrado a los archivos.
    const activeSubtree = await this.folderModel
      .find({
        ownerId: owner,
        isDeleted: false,
        $or: [{ _id: folder._id }, { ancestors: folder._id }],
      })
      .select('_id')
      .exec();
    const folderIds = activeSubtree.map((item) => item._id);

    // Primero la raíz de la cascada y luego los descendientes activos.
    const folderResult = await this.folderModel
      .updateOne(
        { _id: folder._id, ownerId: owner, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: owner,
            deletedRootId,
          },
        },
      )
      .exec();

    const descendantsResult = await this.folderModel
      .updateMany(
        { ownerId: owner, ancestors: folder._id, isDeleted: false },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: owner,
            deletedRootId,
          },
        },
      )
      .exec();

    // El contenido de la carpeta también va a la papelera. Solo se tocan
    // archivos activos; los que ya estaban borrados conservan su raíz.
    const filesResult = await this.fileModel
      .updateMany(
        {
          ownerId: owner,
          folderId: { $in: folderIds },
          isDeleted: false,
        },
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: owner,
            deletedRootId,
          },
        },
      )
      .exec();

    // Auditoría del borrado en cascada: se guardan contadores (nunca arrays
    // ilimitados) y un batchId que correlaciona los eventos de la operación.
    const affectedFolders =
      folderResult.modifiedCount + descendantsResult.modifiedCount;
    const affectedFiles = filesResult.modifiedCount;

    await this.activityService.log({
      actorId: ownerId,
      action: ActivityAction.FOLDER_DELETE,
      resourceType: ActivityResourceType.FOLDER,
      resourceId: folder._id,
      resourceName: folder.name,
      metadata: {
        batchId: randomUUID(),
        affectedFolders,
        affectedFiles,
      },
    });

    return {
      folderId: folder._id.toString(),
      name: folder.name,
      affectedFolders,
      affectedFiles,
    };
  }

  /**
   * Busca una carpeta activa del dueño indicado. Cualquier carpeta que no
   * exista, esté en papelera o pertenezca a otro usuario produce 404.
   */
  private async findOwnedActiveFolder(
    folderId: string,
    ownerId: Types.ObjectId,
    notFoundMessage = 'Carpeta no encontrada',
  ): Promise<FolderDocument> {
    if (!Types.ObjectId.isValid(folderId)) {
      throw new NotFoundException(notFoundMessage);
    }

    const folder = await this.folderModel
      .findOne({ _id: folderId, ownerId, isDeleted: false })
      .exec();

    if (!folder) {
      throw new NotFoundException(notFoundMessage);
    }

    return folder;
  }

  /** Valida el nombre único entre hermanas activas del mismo dueño. */
  private async ensureSiblingNameAvailable(
    ownerId: Types.ObjectId,
    parentId: Types.ObjectId | null,
    name: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const filter: QueryFilter<Folder> = {
      ownerId,
      parentId,
      name,
      isDeleted: false,
    };

    if (excludeId) {
      filter._id = { $ne: excludeId };
    }

    const exists = await this.folderModel.exists(filter);
    if (exists) {
      throw new ConflictException(
        'Ya existe una carpeta con ese nombre entre las hermanas activas',
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
