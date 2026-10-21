/** Tipos de recurso que se pueden compartir. */
export type ShareResourceType = 'FILE' | 'FOLDER';

/**
 * Niveles explícitos de una compartición.
 * La jerarquía creciente es READ < COMMENT < EDIT.
 */
export type ShareAccess = 'READ' | 'COMMENT' | 'EDIT';

/** Nivel efectivo sobre un recurso; OWNER y NONE no se guardan en `shares`. */
export type EffectiveShareAccess = ShareAccess | 'OWNER' | 'NONE';

/** Datos públicos mínimos de un usuario relacionado con una compartición. */
export interface ShareUser {
  _id: string;
  name: string;
  email: string;
}

/** Documento de `shares` devuelto por POST y PATCH. */
export interface ShareDocument {
  _id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  ownerId: string;
  granteeId: string;
  access: ShareAccess;
  createdAt: string;
  updatedAt: string;
}

/**
 * Elemento de los listados "compartido conmigo" y "compartido por mí".
 * Incluye el nombre actual del recurso y los datos básicos de los usuarios.
 */
export interface ShareListItem {
  _id: string;
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
  access: ShareAccess;
  owner: ShareUser | null;
  grantee: ShareUser | null;
  createdAt: string;
  updatedAt: string;
}

/** Body de `POST /api/shares`; se envía exactamente un identificador. */
export interface CreateShareRequest {
  resourceType: ShareResourceType;
  resourceId: string;
  granteeEmail: string;
  access: ShareAccess;
}

/** Body de `PATCH /api/shares/:id`. */
export interface UpdateShareRequest {
  access: ShareAccess;
}

/** Respuesta de `DELETE /api/shares/:id`. */
export interface RevokeShareResponse {
  shareId: string;
  revoked: boolean;
}

/** Orden numérico de los permisos para calcular el máximo heredado. */
export const SHARE_ACCESS_RANK: Record<ShareAccess, number> = {
  READ: 1,
  COMMENT: 2,
  EDIT: 3,
};

/** Etiquetas en español para los selectores de la interfaz. */
export const SHARE_ACCESS_LABELS: Record<ShareAccess, string> = {
  READ: 'Lectura',
  COMMENT: 'Comentarios',
  EDIT: 'Edición',
};

/** Devuelve el permiso de mayor nivel entre los indicados. */
export function highestShareAccess(
  ...accesses: Array<ShareAccess | null | undefined>
): ShareAccess {
  let highest: ShareAccess = 'READ';

  for (const access of accesses) {
    if (access && SHARE_ACCESS_RANK[access] > SHARE_ACCESS_RANK[highest]) {
      highest = access;
    }
  }

  return highest;
}
