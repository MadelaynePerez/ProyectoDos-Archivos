import type { ActivityAction, ActivityResourceType } from './activity.model';
import type { ShareAccess, ShareResourceType, ShareUser } from './share.model';

/** Granularidad temporal admitida por `operations-by-period`. */
export type ReportGranularity = 'day' | 'month';

/**
 * Identificadores de los 14 reportes del contrato.
 *
 * Coinciden con el path de cada endpoint (`/api/reports/<id>`) para que la
 * configuración de la pantalla y el servicio compartan la misma clave.
 */
export type ReportId =
  | 'files-by-type'
  | 'files-by-date-range'
  | 'files-most-operations'
  | 'top-users-by-files'
  | 'users-most-shared'
  | 'files-most-shared'
  | 'shared-by-user'
  | 'received-by-user'
  | 'user-activity'
  | 'operations-by-type'
  | 'operations-by-period'
  | 'top-actions'
  | 'files-never-shared'
  | 'folders-most-files';

/**
 * Filtros comunes de los reportes.
 *
 * `from` y `to` son ISO 8601; `userId` solo lo puede enviar un ADMIN (un USER
 * que envíe otro id recibe 403). `granularity` solo aplica a un reporte.
 */
export interface ReportQuery {
  from?: string;
  to?: string;
  userId?: string;
  granularity?: ReportGranularity;
}

/**
 * Respuestas de la API.
 *
 * Se declaran como alias de tipo (no `interface`) para que TypeScript las
 * considere compatibles con `Record<string, unknown>` y la tabla genérica
 * pueda recibirlas sin conversiones adicionales.
 */

/** `GET /api/reports/files-by-type`. */
export type FilesByTypeReport = {
  extension: string;
  count: number;
  totalSize: number;
};

/** `GET /api/reports/files-by-date-range`. */
export type FilesByDateRangeReport = {
  _id: string;
  name: string;
  extension: string;
  size: number;
  ownerId: string;
  folderId: string | null;
  createdAt: string;
};

/** `GET /api/reports/files-most-operations`. */
export type FilesMostOperationsReport = {
  resourceId: string;
  resourceName: string;
  operations: number;
};

/** `GET /api/reports/top-users-by-files`. */
export type TopUsersByFilesReport = {
  userId: string;
  name: string;
  email: string;
  files: number;
  totalSize: number;
};

/** `GET /api/reports/users-most-shared`. */
export type UsersMostSharedReport = {
  userId: string;
  name: string;
  email: string;
  shares: number;
  sharedResources: number;
};

/** `GET /api/reports/files-most-shared`. */
export type FilesMostSharedReport = {
  fileId: string;
  name: string;
  extension: string;
  ownerId: string;
  ownerName: string;
  sharedWith: number;
};

/** `GET /api/reports/shared-by-user` y `received-by-user`. */
export type UserSharesReport = {
  shareId: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  access: ShareAccess;
  owner: ShareUser | null;
  grantee: ShareUser | null;
  createdAt: string;
  updatedAt: string;
};

/** `GET /api/reports/user-activity` (subconjunto visible en la tabla). */
export type UserActivityReport = {
  _id: string;
  actorId: string | null;
  actorName: string;
  action: ActivityAction;
  resourceType: ActivityResourceType;
  resourceId: string | null;
  resourceName: string;
  createdAt: string;
};

/** `GET /api/reports/operations-by-type`. */
export type OperationsByTypeReport = {
  action: ActivityAction;
  count: number;
};

/** `GET /api/reports/operations-by-period`. */
export type OperationsByPeriodReport = {
  period: string;
  count: number;
};

/** `GET /api/reports/top-actions`. */
export type TopActionsReport = {
  action: ActivityAction;
  resourceType: ActivityResourceType;
  count: number;
};

/** `GET /api/reports/files-never-shared`. */
export type FilesNeverSharedReport = {
  _id: string;
  name: string;
  extension: string;
  size: number;
  ownerId: string;
  ownerName: string;
  createdAt: string;
};

/** `GET /api/reports/folders-most-files`. */
export type FoldersMostFilesReport = {
  folderId: string;
  name: string;
  ownerId: string;
  ownerName: string;
  files: number;
};
