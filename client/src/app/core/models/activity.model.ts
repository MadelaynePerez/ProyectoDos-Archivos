import type { UserRole } from './user.model';

/** Acciones que puede registrar el audit trail del backend. */
export type ActivityAction =
  | 'AUTH_LOGIN'
  | 'USER_CREATE'
  | 'USER_UPDATE'
  | 'USER_DEACTIVATE'
  | 'USER_ACTIVATE'
  | 'FOLDER_CREATE'
  | 'FOLDER_RENAME'
  | 'FOLDER_MOVE'
  | 'FOLDER_DELETE'
  | 'FOLDER_RESTORE'
  | 'FOLDER_PURGE'
  | 'FILE_UPLOAD'
  | 'FILE_DOWNLOAD'
  | 'FILE_RENAME'
  | 'FILE_MOVE'
  | 'FILE_UPDATE'
  | 'FILE_DELETE'
  | 'FILE_RESTORE'
  | 'FILE_PURGE'
  | 'TRASH_EMPTY'
  | 'SHARE_GRANT'
  | 'SHARE_UPDATE'
  | 'SHARE_REVOKE';

/** Tipos de recurso afectado por un evento. */
export type ActivityResourceType = 'USER' | 'FOLDER' | 'FILE' | 'SHARE' | 'AUTH' | 'SYSTEM';

/**
 * Documento de `activity_log`.
 *
 * `actorName` y `resourceName` son copias del momento del evento: el historial
 * sigue siendo legible aunque el usuario o el recurso ya no existan.
 */
export interface ActivityEvent {
  _id: string;
  actorId: string | null;
  actorName: string;
  actorRole: UserRole | null;
  action: ActivityAction;
  resourceType: ActivityResourceType;
  resourceId: string | null;
  resourceName: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** Filtros y paginación de `GET /api/activity`. */
export interface ListActivityQuery {
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** Respuesta paginada de `GET /api/activity`. */
export interface ActivityListResponse {
  items: ActivityEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Etiquetas en español para la columna "Acción". */
export const ACTIVITY_ACTION_LABELS: Record<ActivityAction, string> = {
  AUTH_LOGIN: 'Inicio de sesión',
  USER_CREATE: 'Usuario creado',
  USER_UPDATE: 'Usuario actualizado',
  USER_DEACTIVATE: 'Usuario desactivado',
  USER_ACTIVATE: 'Usuario activado',
  FOLDER_CREATE: 'Carpeta creada',
  FOLDER_RENAME: 'Carpeta renombrada',
  FOLDER_MOVE: 'Carpeta movida',
  FOLDER_DELETE: 'Carpeta eliminada',
  FOLDER_RESTORE: 'Carpeta restaurada',
  FOLDER_PURGE: 'Carpeta purgada',
  FILE_UPLOAD: 'Archivo subido',
  FILE_DOWNLOAD: 'Archivo descargado',
  FILE_RENAME: 'Archivo renombrado',
  FILE_MOVE: 'Archivo movido',
  FILE_UPDATE: 'Archivo actualizado',
  FILE_DELETE: 'Archivo eliminado',
  FILE_RESTORE: 'Archivo restaurado',
  FILE_PURGE: 'Archivo purgado',
  TRASH_EMPTY: 'Papelera vaciada',
  SHARE_GRANT: 'Permiso concedido',
  SHARE_UPDATE: 'Permiso actualizado',
  SHARE_REVOKE: 'Permiso retirado',
};

/** Devuelve la etiqueta legible; si el backend agrega una acción, usa el código. */
export function activityActionLabel(action: string): string {
  return ACTIVITY_ACTION_LABELS[action as ActivityAction] ?? action;
}
