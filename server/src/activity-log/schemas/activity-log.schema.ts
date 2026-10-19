import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, type HydratedDocument, type Types } from 'mongoose';

import { UserRole } from '../../users/schemas/user.schema.js';

/** Catálogo cerrado de acciones auditables. */
export enum ActivityAction {
  AUTH_LOGIN = 'AUTH_LOGIN',
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DEACTIVATE = 'USER_DEACTIVATE',
  USER_ACTIVATE = 'USER_ACTIVATE',
  FOLDER_CREATE = 'FOLDER_CREATE',
  FOLDER_RENAME = 'FOLDER_RENAME',
  FOLDER_MOVE = 'FOLDER_MOVE',
  FILE_UPLOAD = 'FILE_UPLOAD',
  FILE_DOWNLOAD = 'FILE_DOWNLOAD',
  FILE_RENAME = 'FILE_RENAME',
  FILE_MOVE = 'FILE_MOVE',
  FILE_UPDATE = 'FILE_UPDATE',
  FILE_DELETE = 'FILE_DELETE',
  FOLDER_DELETE = 'FOLDER_DELETE',
  FILE_RESTORE = 'FILE_RESTORE',
  FOLDER_RESTORE = 'FOLDER_RESTORE',
  FILE_PURGE = 'FILE_PURGE',
  FOLDER_PURGE = 'FOLDER_PURGE',
  TRASH_EMPTY = 'TRASH_EMPTY',
  SHARE_GRANT = 'SHARE_GRANT',
  SHARE_UPDATE = 'SHARE_UPDATE',
  SHARE_REVOKE = 'SHARE_REVOKE',
}

/** Tipos de recurso afectado por un evento. */
export enum ActivityResourceType {
  USER = 'USER',
  FOLDER = 'FOLDER',
  FILE = 'FILE',
  SHARE = 'SHARE',
  AUTH = 'AUTH',
  SYSTEM = 'SYSTEM',
}

/**
 * Colección `activity_log`.
 *
 * Audit trail inmutable y append-only: nunca se actualiza ni se borra, ni
 * siquiera al purgar el recurso. Por eso solo tiene `createdAt`, sin
 * `updatedAt`, y no se exponen endpoints de modificación.
 */
@Schema({
  collection: 'activity_log',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class ActivityLog {
  /**
   * Relación: `users` 1 —— N `activity_log`.
   * `null` identifica acciones de procesos del sistema o del seed.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', default: null })
  actorId: Types.ObjectId | null;

  /**
   * Copia del nombre del actor en el momento del evento. Es un snapshot para
   * que la auditoría siga siendo legible aunque el usuario se desactive.
   */
  @Prop({ required: true, trim: true })
  actorName: string;

  /** Snapshot del rol del actor; `null` para procesos del sistema. */
  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: null,
  })
  actorRole: UserRole | null;

  /** Acción del catálogo. */
  @Prop({
    required: true,
    type: String,
    enum: Object.values(ActivityAction),
  })
  action: ActivityAction;

  /** Tipo de recurso afectado. */
  @Prop({
    required: true,
    type: String,
    enum: Object.values(ActivityResourceType),
  })
  resourceType: ActivityResourceType;

  /**
   * Referencia lógica al recurso afectado. Es polimórfica (según
   * `resourceType`) y puede ser `null` en acciones globales.
   */
  @Prop({ type: SchemaTypes.ObjectId, default: null })
  resourceId: Types.ObjectId | null;

  /**
   * Copia del nombre del recurso en el momento del evento. Nunca se reconstruye
   * con `$lookup`: el recurso puede haber sido purgado y el historial debe
   * seguir teniendo sentido.
   */
  @Prop({ required: true, trim: true })
  resourceName: string;

  /**
   * Datos variables y acotados del evento. Puede incluir `parentId`,
   * `fromParentId`, `toParentId`, `extension`, `size`, `access`, `granteeId`,
   * contadores `affectedFolders` / `affectedFiles`, `batchId` (UUID de una
   * cascada), `ip` y `userAgent`.
   *
   * Invariante: nunca contiene arrays ilimitados; para cascadas se usan
   * contadores y un `batchId` que correlaciona los eventos.
   */
  @Prop({ type: SchemaTypes.Mixed, default: {} })
  metadata: Record<string, unknown>;
}

export type ActivityLogDocument = HydratedDocument<ActivityLog>;

export const ActivityLogSchema = SchemaFactory.createForClass(ActivityLog);

// Compuesto: historial de un usuario en un rango, ordenado por fecha.
ActivityLogSchema.index({ actorId: 1, createdAt: -1 });

// Compuesto: línea de tiempo de un recurso (incluye recursos ya purgados).
ActivityLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

// Compuesto: operaciones agrupadas por tipo y período.
ActivityLogSchema.index({ action: 1, createdAt: -1 });

// Simple: últimos eventos globales y reportes por rango sin filtro de actor.
ActivityLogSchema.index({ createdAt: -1 });

// Disperso: reconstruir una cascada concreta por su `batchId`.
ActivityLogSchema.index({ 'metadata.batchId': 1 }, { sparse: true });
