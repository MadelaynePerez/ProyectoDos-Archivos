import type { Types } from 'mongoose';

/** Tipos de recurso que acepta la papelera en la URL (`file` o `folder`). */
export enum TrashResourceType {
  FILE = 'file',
  FOLDER = 'folder',
}

/**
 * Elemento del listado de papelera.
 *
 * Se devuelve el documento completo de `files` o `folders` y se añade `type`
 * para que el cliente sepa a qué colección pertenece sin ambigüedad.
 */
export interface TrashItem {
  _id: Types.ObjectId;
  type: TrashResourceType;
  name: string;
  deletedAt: Date | null;
  [key: string]: unknown;
}

/** Resumen de una purga definitiva o del vaciado completo de la papelera. */
export interface PurgeResult {
  type: TrashResourceType | 'trash';
  resourceId: Types.ObjectId | null;
  name: string;
  affectedFolders: number;
  affectedFiles: number;
  freedBytes: number;
  batchId: string;
}
