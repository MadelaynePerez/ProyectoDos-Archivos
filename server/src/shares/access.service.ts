import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';

import { File, type FileDocument } from '../files/schemas/file.schema.js';
import {
  Folder,
  type FolderDocument,
} from '../folders/schemas/folder.schema.js';
import {
  Share,
  ShareAccess,
  ShareResourceType,
} from './schemas/share.schema.js';

/**
 * Acceso efectivo de un usuario sobre un recurso.
 *
 * `OWNER` es el nivel máximo y no se guarda en `shares`: se deriva de
 * `ownerId`. El resto coincide con los valores de `shares.access`.
 */
export enum EffectiveAccess {
  NONE = 'NONE',
  READ = 'READ',
  COMMENT = 'COMMENT',
  EDIT = 'EDIT',
  OWNER = 'OWNER',
}

/**
 * Orden creciente de permisos. Se usa para quedarse con el máximo cuando un
 * archivo recibe permisos directos y heredados de varias carpetas.
 */
const ACCESS_RANK: Record<EffectiveAccess, number> = {
  [EffectiveAccess.NONE]: 0,
  [EffectiveAccess.READ]: 1,
  [EffectiveAccess.COMMENT]: 2,
  [EffectiveAccess.EDIT]: 3,
  [EffectiveAccess.OWNER]: 4,
};

/** Los valores de `shares.access` coinciden con los niveles efectivos. */
const SHARE_TO_EFFECTIVE: Record<ShareAccess, EffectiveAccess> = {
  [ShareAccess.READ]: EffectiveAccess.READ,
  [ShareAccess.COMMENT]: EffectiveAccess.COMMENT,
  [ShareAccess.EDIT]: EffectiveAccess.EDIT,
};

/** Recurso resuelto junto con el acceso efectivo del usuario autenticado. */
export interface ResourceAccess<T> {
  resource: T;
  access: EffectiveAccess;
}

/**
 * Resolución centralizada de permisos.
 *
 * Reglas:
 * - El propietario siempre tiene `OWNER`.
 * - Un recurso en papelera devuelve `NONE` para todos, incluido el dueño.
 * - En un archivo se combinan el share directo y los shares de su carpeta y de
 *   `folder.ancestors`, tomando el máximo.
 * - En una carpeta se combinan sus shares y los de sus ancestros.
 * - Sin share no hay acceso: `NONE`.
 *
 * Los métodos `require*` traducen cualquier acceso insuficiente a 404 para no
 * revelar la existencia de recursos ajenos.
 */
@Injectable()
export class AccessService {
  constructor(
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    @InjectModel(Folder.name)
    private readonly folderModel: Model<Folder>,
    @InjectModel(Share.name)
    private readonly shareModel: Model<Share>,
  ) {}

  /** Devuelve OWNER, EDIT, COMMENT, READ o NONE para el recurso indicado. */
  async getEffectiveAccess(
    userId: string,
    resourceType: ShareResourceType,
    resourceId: string | Types.ObjectId,
  ): Promise<EffectiveAccess> {
    if (resourceType === ShareResourceType.FILE) {
      const result = await this.resolveFileAccess(userId, resourceId);
      return result?.access ?? EffectiveAccess.NONE;
    }

    if (resourceType === ShareResourceType.FOLDER) {
      const result = await this.resolveFolderAccess(userId, resourceId);
      return result?.access ?? EffectiveAccess.NONE;
    }

    return EffectiveAccess.NONE;
  }

  /**
   * Resuelve un archivo activo y el acceso efectivo del usuario.
   * Devuelve `null` si el archivo no existe o está en papelera.
   */
  async resolveFileAccess(
    userId: string,
    fileId: string | Types.ObjectId,
  ): Promise<ResourceAccess<FileDocument> | null> {
    const user = this.toObjectId(userId);
    const id = this.toObjectId(fileId);
    if (!user || !id) {
      return null;
    }

    const file = await this.fileModel.findById(id).exec();
    // Papelera: se deniega el acceso aunque exista un share (el share se
    // conserva para que al restaurar el recurso vuelva a aplicar).
    if (!file || file.isDeleted) {
      return null;
    }

    if (file.ownerId.equals(user)) {
      return { resource: file, access: EffectiveAccess.OWNER };
    }

    /*
     * Herencia en archivos: el permiso efectivo es el máximo entre el share
     * directo del archivo y los shares de su carpeta y de todas las carpetas
     * de `folder.ancestors`. No se copian permisos a los archivos: se resuelve
     * en cada consulta, así un permiso nuevo o revocado en la carpeta aplica
     * de inmediato a todo su contenido actual y futuro.
     */
    const folderIds: Types.ObjectId[] = [];
    if (file.folderId) {
      const folder = await this.folderModel
        .findById(file.folderId)
        .select('ancestors isDeleted')
        .exec();

      if (folder && !folder.isDeleted) {
        folderIds.push(folder._id, ...folder.ancestors);
      }
    }

    const conditions: QueryFilter<Share>[] = [
      { resourceType: ShareResourceType.FILE, resourceId: file._id },
    ];

    if (folderIds.length > 0) {
      conditions.push({
        resourceType: ShareResourceType.FOLDER,
        resourceId: { $in: folderIds },
      });
    }

    const shares = await this.shareModel
      .find({ granteeId: user, $or: conditions })
      .select('access')
      .exec();

    return {
      resource: file,
      access: this.maxShareAccess(shares),
    };
  }

  /**
   * Resuelve una carpeta activa y el acceso efectivo del usuario.
   * Devuelve `null` si la carpeta no existe o está en papelera.
   */
  async resolveFolderAccess(
    userId: string,
    folderId: string | Types.ObjectId,
  ): Promise<ResourceAccess<FolderDocument> | null> {
    const user = this.toObjectId(userId);
    const id = this.toObjectId(folderId);
    if (!user || !id) {
      return null;
    }

    const folder = await this.folderModel.findById(id).exec();
    // Mismo criterio que en archivos: la papelera anula cualquier permiso.
    if (!folder || folder.isDeleted) {
      return null;
    }

    if (folder.ownerId.equals(user)) {
      return { resource: folder, access: EffectiveAccess.OWNER };
    }

    /*
     * Herencia en carpetas: se consideran el share propio de la carpeta y los
     * de sus ancestros. Como `ancestors` va de raíz a padre, compartir una
     * carpeta superior alcanza a todas sus descendientes sin consultar el
     * árbol completo ni duplicar documentos en `shares`.
     */
    const resourceIds = [folder._id, ...folder.ancestors];

    const shares = await this.shareModel
      .find({
        granteeId: user,
        resourceType: ShareResourceType.FOLDER,
        resourceId: { $in: resourceIds },
      })
      .select('access')
      .exec();

    return {
      resource: folder,
      access: this.maxShareAccess(shares),
    };
  }

  /** Exige al menos READ sobre un archivo; si no, responde 404. */
  async requireFileAccess(
    userId: string,
    fileId: string | Types.ObjectId,
    minimum: EffectiveAccess,
  ): Promise<ResourceAccess<FileDocument>> {
    const result = await this.resolveFileAccess(userId, fileId);

    if (!result || !this.hasAtLeast(result.access, minimum)) {
      throw new NotFoundException('Archivo no encontrado');
    }

    return result;
  }

  /** Exige al menos READ sobre una carpeta; si no, responde 404. */
  async requireFolderAccess(
    userId: string,
    folderId: string | Types.ObjectId,
    minimum: EffectiveAccess,
  ): Promise<ResourceAccess<FolderDocument>> {
    const result = await this.resolveFolderAccess(userId, folderId);

    if (!result || !this.hasAtLeast(result.access, minimum)) {
      throw new NotFoundException('Carpeta no encontrada');
    }

    return result;
  }

  /** Convierte READ/COMMENT/EDIT de un share al máximo acceso efectivo. */
  private maxShareAccess(
    shares: Array<{ access: ShareAccess }>,
  ): EffectiveAccess {
    let best = EffectiveAccess.NONE;

    for (const share of shares) {
      const access = SHARE_TO_EFFECTIVE[share.access];
      if (ACCESS_RANK[access] > ACCESS_RANK[best]) {
        best = access;
      }
    }

    return best;
  }

  private hasAtLeast(
    access: EffectiveAccess,
    minimum: EffectiveAccess,
  ): boolean {
    return ACCESS_RANK[access] >= ACCESS_RANK[minimum];
  }

  private toObjectId(
    value: string | Types.ObjectId | null | undefined,
  ): Types.ObjectId | null {
    if (!value) {
      return null;
    }
    if (value instanceof Types.ObjectId) {
      return value;
    }
    if (!Types.ObjectId.isValid(value)) {
      return null;
    }
    return new Types.ObjectId(value);
  }
}
