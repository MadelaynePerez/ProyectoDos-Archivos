import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, type QueryFilter } from 'mongoose';

import {
  ActivityAction,
  ActivityLog,
  ActivityResourceType,
  type ActivityLogDocument,
} from '../activity-log/schemas/activity-log.schema.js';
import { User, type UserRole } from '../users/schemas/user.schema.js';
import type { ListActivityQueryDto } from './dto/list-activity-query.dto.js';

/**
 * Datos de un evento de auditoría.
 *
 * `actorName` y `actorRole` son opcionales: si no se envían (por ejemplo, desde
 * un request autenticado donde solo se conoce el id), el servicio los copia
 * desde `users` en ese instante. Así el log conserva el nombre y el rol aunque
 * el usuario cambie después.
 */
export interface LogActivityInput {
  actorId: string | Types.ObjectId | null;
  actorName?: string;
  actorRole?: UserRole | null;
  action: ActivityAction;
  resourceType: ActivityResourceType;
  resourceId?: string | Types.ObjectId | null;
  resourceName: string;
  metadata?: Record<string, unknown>;
}

/** Respuesta paginada del historial. */
export interface PaginatedActivity {
  items: ActivityLogDocument[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Filtro con `createdAt`, que no es una propiedad declarada del esquema. */
type ActivityFilter = QueryFilter<ActivityLog> & {
  createdAt?: { $gte?: Date; $lte?: Date };
};

/**
 * Servicio de auditoría.
 *
 * `activity_log` es append-only: este servicio solo expone `log` (insert) y
 * `findForActor` (lectura). No existen métodos de actualización ni borrado, y
 * tampoco endpoints HTTP para modificarlo.
 */
@Injectable()
export class ActivityService {
  constructor(
    @InjectModel(ActivityLog.name)
    private readonly activityModel: Model<ActivityLog>,
    // Se usa para copiar el nombre y el rol del actor cuando el llamador solo
    // dispone de su id (operaciones autenticadas de carpetas y archivos).
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  /**
   * Inserta un evento en `activity_log`.
   *
   * Nunca actualiza ni elimina documentos. El nombre del recurso se guarda como
   * copia (`resourceName`), de modo que el historial siga siendo legible aunque
   * el recurso se purgue definitivamente.
   */
  async log(input: LogActivityInput): Promise<ActivityLogDocument> {
    const actorId = this.toObjectId(input.actorId);
    const resourceId = this.toObjectId(input.resourceId ?? null);

    const { actorName, actorRole } = await this.resolveActorSnapshot(
      actorId,
      input.actorName,
      input.actorRole,
    );

    return this.activityModel.create({
      actorId,
      actorName,
      actorRole,
      action: input.action,
      resourceType: input.resourceType,
      resourceId,
      resourceName: input.resourceName.trim(),
      metadata: input.metadata ?? {},
    });
  }

  /**
   * Historial del usuario autenticado, ordenado del evento más reciente al más
   * antiguo. El filtro por `actorId` usa el índice `{ actorId, createdAt }`.
   */
  async findForActor(
    actorId: string,
    query: ListActivityQueryDto,
  ): Promise<PaginatedActivity> {
    const actor = this.toObjectId(actorId);
    if (!actor) {
      throw new BadRequestException('Usuario autenticado inválido');
    }

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;

    if (from && to && from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'from no puede ser posterior a to',
      );
    }

    const filter: ActivityFilter = { actorId: actor };

    if (from || to) {
      filter.createdAt = {};
      if (from) {
        filter.createdAt.$gte = from;
      }
      if (to) {
        filter.createdAt.$lte = to;
      }
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    // `_id` como segundo criterio hace la paginación estable cuando dos
    // eventos comparten el mismo milisegundo.
    const [items, total] = await Promise.all([
      this.activityModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.activityModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Completa el snapshot del actor. Se consulta `users` solo cuando falta el
   * nombre o el rol; el login ya los conoce y los envía directamente.
   */
  private async resolveActorSnapshot(
    actorId: Types.ObjectId | null,
    providedName?: string,
    providedRole?: UserRole | null,
  ): Promise<{ actorName: string; actorRole: UserRole | null }> {
    let actorName = providedName?.trim() ?? '';
    let actorRole = providedRole ?? null;

    if (actorId && (!actorName || !actorRole)) {
      const user = await this.userModel
        .findById(actorId)
        .select('name role')
        .exec();

      if (user) {
        actorName = actorName || user.name;
        actorRole = actorRole ?? user.role;
      }
    }

    // Fallback defensivo: el esquema exige `actorName`. Para procesos del
    // sistema se usa "Sistema"; para un actor que ya no existe, su id.
    if (!actorName) {
      actorName = actorId ? actorId.toHexString() : 'Sistema';
    }

    return { actorName, actorRole };
  }

  /** Convierte ids de entrada en ObjectId; `null`/vacío se conserva como null. */
  private toObjectId(
    value: string | Types.ObjectId | null | undefined,
  ): Types.ObjectId | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (value instanceof Types.ObjectId) {
      return value;
    }
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException('Identificador de auditoría inválido');
    }
    return new Types.ObjectId(value);
  }
}
