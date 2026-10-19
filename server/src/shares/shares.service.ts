import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  ActivityAction,
  ActivityResourceType,
} from '../activity-log/schemas/activity-log.schema.js';
import { ActivityService } from '../activity/activity.service.js';
import { File } from '../files/schemas/file.schema.js';
import { Folder } from '../folders/schemas/folder.schema.js';
import { User, type UserDocument } from '../users/schemas/user.schema.js';
import { CreateShareDto } from './dto/create-share.dto.js';
import { UpdateShareDto } from './dto/update-share.dto.js';
import {
  Share,
  ShareAccess,
  ShareResourceType,
  type ShareDocument,
} from './schemas/share.schema.js';

/** Datos públicos mínimos del usuario relacionado con una compartición. */
export interface RelatedUser {
  _id: string;
  name: string;
  email: string;
}

/**
 * Elemento de los listados "compartido por mí" / "compartido conmigo".
 * El nombre del recurso se lee en el momento de la consulta, no es un snapshot.
 */
export interface ShareListItem {
  _id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  access: ShareAccess;
  owner: RelatedUser | null;
  grantee: RelatedUser | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Respuesta del retiro de un permiso. */
export interface RevokedShare {
  shareId: string;
  revoked: true;
}

/**
 * Gestión de comparticiones (`shares`).
 *
 * Solo el propietario del recurso puede conceder, modificar o retirar
 * permisos. El destinatario debe existir, estar activo y ser distinto del
 * dueño. El acceso se actualiza sobre el mismo documento para respetar el
 * índice único `{ resourceType, resourceId, granteeId }`.
 */
@Injectable()
export class SharesService {
  constructor(
    @InjectModel(Share.name)
    private readonly shareModel: Model<Share>,
    @InjectModel(File.name)
    private readonly fileModel: Model<File>,
    @InjectModel(Folder.name)
    private readonly folderModel: Model<Folder>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly activityService: ActivityService,
  ) {}

  /**
   * Concede un permiso. Si ya existe uno para el mismo recurso y usuario,
   * actualiza `access` en lugar de crear un duplicado.
   */
  async grant(ownerId: string, dto: CreateShareDto): Promise<ShareDocument> {
    const owner = new Types.ObjectId(ownerId);
    const grantee = await this.resolveGrantee(dto);

    if (grantee._id.equals(owner)) {
      throw new BadRequestException(
        'No puedes compartir un recurso contigo mismo',
      );
    }

    const resource = await this.findOwnedActiveResource(
      owner,
      dto.resourceType,
      dto.resourceId,
    );

    const filter = {
      resourceType: dto.resourceType,
      resourceId: resource.id,
      granteeId: grantee._id,
    };

    const existing = await this.shareModel.findOne(filter).exec();
    if (existing) {
      return this.applyAccessUpdate(
        existing,
        dto.access,
        ownerId,
        resource.name,
      );
    }

    try {
      const created = await this.shareModel.create({
        ...filter,
        ownerId: owner,
        access: dto.access,
      });

      await this.logShare(
        ActivityAction.SHARE_GRANT,
        ownerId,
        created,
        resource.name,
        { access: dto.access },
      );

      return created;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        throw error;
      }

      // Condición de carrera: otro request creó el mismo share entre la
      // comprobación y el insert. El índice único lo impide; se actualiza.
      const share = await this.shareModel.findOne(filter).exec();
      if (!share) {
        throw error;
      }

      return this.applyAccessUpdate(share, dto.access, ownerId, resource.name);
    }
  }

  /** Cambia el nivel de acceso de un share propio. */
  async update(
    ownerId: string,
    shareId: string,
    dto: UpdateShareDto,
  ): Promise<ShareDocument> {
    const share = await this.findOwnedShare(ownerId, shareId);
    const resourceName = await this.getResourceName(
      share.resourceType,
      share.resourceId,
    );

    return this.applyAccessUpdate(share, dto.access, ownerId, resourceName);
  }

  /** Retira un permiso propio. */
  async revoke(ownerId: string, shareId: string): Promise<RevokedShare> {
    const share = await this.findOwnedShare(ownerId, shareId);
    const resourceName = await this.getResourceName(
      share.resourceType,
      share.resourceId,
    );

    await this.shareModel
      .deleteOne({ _id: share._id, ownerId: new Types.ObjectId(ownerId) })
      .exec();

    await this.logShare(
      ActivityAction.SHARE_REVOKE,
      ownerId,
      share,
      resourceName,
      { access: share.access },
    );

    return { shareId: share._id.toString(), revoked: true };
  }

  /** "Compartido por mí": shares cuyo `ownerId` es el usuario autenticado. */
  async listSharedByMe(ownerId: string): Promise<ShareListItem[]> {
    const shares = await this.shareModel
      .find({ ownerId: new Types.ObjectId(ownerId) })
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return this.buildListItems(shares);
  }

  /** "Compartido conmigo": shares cuyo `granteeId` es el usuario autenticado. */
  async listSharedWithMe(granteeId: string): Promise<ShareListItem[]> {
    const shares = await this.shareModel
      .find({ granteeId: new Types.ObjectId(granteeId) })
      .sort({ createdAt: -1, _id: -1 })
      .exec();

    return this.buildListItems(shares);
  }

  /** Aplica el nuevo acceso sobre el mismo documento y audita el cambio. */
  private async applyAccessUpdate(
    share: ShareDocument,
    access: UpdateShareDto['access'],
    actorId: string,
    resourceName: string,
  ): Promise<ShareDocument> {
    const previousAccess = share.access;
    share.access = access;
    await share.save();

    await this.logShare(
      ActivityAction.SHARE_UPDATE,
      actorId,
      share,
      resourceName,
      { access, previousAccess },
    );

    return share;
  }

  /**
   * Construye la respuesta de los listados con el nombre actual del recurso y
   * los usuarios relacionados. Se omiten shares huérfanos o cuyo recurso está
   * en papelera: el invitado ya no puede acceder a ellos.
   */
  private async buildListItems(
    shares: ShareDocument[],
  ): Promise<ShareListItem[]> {
    if (shares.length === 0) {
      return [];
    }

    const fileIds: Types.ObjectId[] = [];
    const folderIds: Types.ObjectId[] = [];
    const userIds = new Set<string>();

    for (const share of shares) {
      if (share.resourceType === ShareResourceType.FILE) {
        fileIds.push(share.resourceId);
      } else {
        folderIds.push(share.resourceId);
      }
      userIds.add(share.ownerId.toString());
      userIds.add(share.granteeId.toString());
    }

    const [files, folders, users] = await Promise.all([
      fileIds.length > 0
        ? this.fileModel
            .find({ _id: { $in: fileIds } })
            .select('name isDeleted')
            .exec()
        : [],
      folderIds.length > 0
        ? this.folderModel
            .find({ _id: { $in: folderIds } })
            .select('name isDeleted')
            .exec()
        : [],
      this.userModel
        .find({ _id: { $in: [...userIds] } })
        .select('name email')
        .exec(),
    ]);

    const resourceNames = new Map<string, string>();
    for (const file of files) {
      if (!file.isDeleted) {
        resourceNames.set(
          this.resourceKey(ShareResourceType.FILE, file._id),
          file.name,
        );
      }
    }
    for (const folder of folders) {
      if (!folder.isDeleted) {
        resourceNames.set(
          this.resourceKey(ShareResourceType.FOLDER, folder._id),
          folder.name,
        );
      }
    }

    const usersById = new Map<string, RelatedUser>();
    for (const user of users) {
      usersById.set(user._id.toString(), this.toRelatedUser(user));
    }

    const items: ShareListItem[] = [];

    for (const share of shares) {
      const resourceName = resourceNames.get(
        this.resourceKey(share.resourceType, share.resourceId),
      );

      // Recurso purgado o en papelera: no se muestra en los listados.
      if (!resourceName) {
        continue;
      }

      items.push({
        _id: share._id.toString(),
        resourceType: share.resourceType,
        resourceId: share.resourceId.toString(),
        resourceName,
        access: share.access,
        owner: usersById.get(share.ownerId.toString()) ?? null,
        grantee: usersById.get(share.granteeId.toString()) ?? null,
        createdAt: share.get('createdAt') as Date,
        updatedAt: share.get('updatedAt') as Date,
      });
    }

    return items;
  }

  /** Valida que el recurso exista, esté activo y pertenezca al usuario. */
  private async findOwnedActiveResource(
    ownerId: Types.ObjectId,
    resourceType: ShareResourceType,
    resourceId: string,
  ): Promise<{ id: Types.ObjectId; name: string }> {
    if (resourceType === ShareResourceType.FOLDER) {
      const folder = await this.folderModel
        .findOne({
          _id: resourceId,
          ownerId,
          isDeleted: false,
        })
        .select('name')
        .exec();

      if (!folder) {
        throw new NotFoundException('Recurso no encontrado');
      }

      return { id: folder._id, name: folder.name };
    }

    const file = await this.fileModel
      .findOne({
        _id: resourceId,
        ownerId,
        isDeleted: false,
      })
      .select('name')
      .exec();

    if (!file) {
      throw new NotFoundException('Recurso no encontrado');
    }

    return { id: file._id, name: file.name };
  }

  /** Resuelve el destinatario por email o id; debe existir y estar activo. */
  private async resolveGrantee(dto: CreateShareDto): Promise<UserDocument> {
    const email = dto.granteeEmail?.trim();
    const id = dto.granteeId?.trim();

    if ((email && id) || (!email && !id)) {
      throw new BadRequestException(
        'Debes indicar granteeEmail o granteeId, pero no ambos',
      );
    }

    const user = email
      ? await this.userModel.findOne({ email }).exec()
      : await this.userModel.findById(id).exec();

    // Un usuario inexistente o inactivo se trata como no encontrado para no
    // revelar cuentas desactivadas.
    if (!user || !user.isActive) {
      throw new NotFoundException(
        'El usuario destinatario no existe o está inactivo',
      );
    }

    return user;
  }

  /** Busca un share por id exigiendo que pertenezca al usuario autenticado. */
  private async findOwnedShare(
    ownerId: string,
    shareId: string,
  ): Promise<ShareDocument> {
    if (!Types.ObjectId.isValid(shareId)) {
      throw new NotFoundException('Compartición no encontrada');
    }

    const share = await this.shareModel
      .findOne({
        _id: shareId,
        ownerId: new Types.ObjectId(ownerId),
      })
      .exec();

    if (!share) {
      throw new NotFoundException('Compartición no encontrada');
    }

    return share;
  }

  /** Nombre actual del recurso para el snapshot de auditoría. */
  private async getResourceName(
    resourceType: ShareResourceType,
    resourceId: Types.ObjectId,
  ): Promise<string> {
    const resource =
      resourceType === ShareResourceType.FOLDER
        ? await this.folderModel.findById(resourceId).select('name').exec()
        : await this.fileModel.findById(resourceId).select('name').exec();

    // El share puede sobrevivir a un recurso purgado de forma anómala; el log
    // sigue siendo válido con un nombre de respaldo.
    return resource?.name ?? 'Recurso eliminado';
  }

  /**
   * Registra la acción con `resourceType: SHARE` y el id del share. En
   * `metadata` se conserva el recurso real para poder reconstruir el contexto.
   */
  private async logShare(
    action: ActivityAction,
    actorId: string,
    share: ShareDocument,
    resourceName: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.activityService.log({
      actorId,
      action,
      resourceType: ActivityResourceType.SHARE,
      resourceId: share._id,
      resourceName,
      metadata: {
        resourceType: share.resourceType,
        resourceId: share.resourceId,
        granteeId: share.granteeId,
        ...metadata,
      },
    });
  }

  private toRelatedUser(user: UserDocument): RelatedUser {
    return {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
    };
  }

  private resourceKey(
    resourceType: ShareResourceType,
    resourceId: Types.ObjectId,
  ): string {
    return `${resourceType}:${resourceId.toString()}`;
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
