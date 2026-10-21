/** Documento público de la colección `folders`. */
export interface Folder {
  _id: string;
  name: string;
  ownerId: string;
  parentId: string | null;
  ancestors: string[];
  depth: number;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedRootId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /api/folders`. */
export interface CreateFolderRequest {
  name: string;
  parentId?: string | null;
}

/** Body de `PATCH /api/folders/:id/rename`. */
export interface RenameFolderRequest {
  name: string;
}

/** Body de `PATCH /api/folders/:id/move`; `null` mueve a la raíz. */
export interface MoveFolderRequest {
  newParentId: string | null;
}

/** Respuesta de `DELETE /api/folders/:id` (soft delete en cascada). */
export interface DeleteFolderResponse {
  folderId: string;
  name: string;
  affectedFolders: number;
  affectedFiles: number;
}
