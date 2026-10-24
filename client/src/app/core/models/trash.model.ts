import type { FileExtension, FileMimeType } from './file.model';

/** Tipos de recurso aceptados por las rutas `/api/trash/:type/:id`. */
export type TrashResourceType = 'file' | 'folder';

/** Campos comunes de una raíz de papelera (archivo o carpeta). */
export interface TrashItemBase {
  _id: string;
  name: string;
  ownerId: string;
  isDeleted: true;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedRootId: string | null;
}

/** Archivo en papelera tal como lo devuelve `GET /api/trash`. */
export interface TrashFileItem extends TrashItemBase {
  type: 'file';
  folderId: string | null;
  extension: FileExtension;
  mimeType: FileMimeType;
  size: number;
  gridFsId: string;
}

/** Carpeta en papelera tal como la devuelve `GET /api/trash`. */
export interface TrashFolderItem extends TrashItemBase {
  type: 'folder';
  parentId: string | null;
  ancestors: string[];
  depth: number;
}

/**
 * Elemento de la papelera.
 *
 * La API solo lista las raíces de cada borrado (`deletedRootId == _id`); los
 * descendientes de una carpeta se restauran o purgan junto con ella.
 */
export type TrashItem = TrashFileItem | TrashFolderItem;

/** Respuesta de `DELETE /api/trash/:type/:id` y `DELETE /api/trash`. */
export interface TrashPurgeResponse {
  type: TrashResourceType | 'trash';
  resourceId: string | null;
  name: string;
  affectedFolders: number;
  affectedFiles: number;
  freedBytes: number;
  batchId: string;
}
