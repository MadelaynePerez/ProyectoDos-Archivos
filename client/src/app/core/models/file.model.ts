/** Extensiones permitidas por el backend. */
export type FileExtension = 'txt' | 'md';

/** MIME normalizado que devuelve la API. */
export type FileMimeType = 'text/plain' | 'text/markdown';

/** Criterios de ordenamiento de `GET /api/files`. */
export type FileSortBy = 'name' | 'date' | 'size';

/** Dirección del ordenamiento. */
export type SortOrder = 'asc' | 'desc';

/** Documento público de `files`; el contenido real vive en GridFS. */
export interface FileItem {
  _id: string;
  name: string;
  ownerId: string;
  folderId: string | null;
  extension: FileExtension;
  mimeType: FileMimeType;
  size: number;
  gridFsId: string;
  contentHash: string;
  isDeleted: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  deletedRootId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Filtros y orden de `GET /api/files`. */
export interface ListFilesQuery {
  folderId?: string | null;
  search?: string;
  extension?: FileExtension | '';
  sortBy?: FileSortBy;
  sortOrder?: SortOrder;
}

/** Body de `PATCH /api/files/:id/rename`. */
export interface RenameFileRequest {
  name: string;
}

/** Body de `PATCH /api/files/:id/move`; `null` mueve a la raíz. */
export interface MoveFileRequest {
  newFolderId: string | null;
}
