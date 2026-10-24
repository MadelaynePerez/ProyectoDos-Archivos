import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type { FileItem } from '../models/file.model';
import type { Folder } from '../models/folder.model';
import type { TrashItem, TrashPurgeResponse, TrashResourceType } from '../models/trash.model';

/**
 * Servicio de la papelera lógica.
 *
 * La papelera no es una colección aparte: la API devuelve las raíces de
 * `files` y `folders` con `isDeleted: true`. El JWT lo agrega el interceptor
 * global y el propietario se deriva del token, nunca del body.
 */
@Injectable({ providedIn: 'root' })
export class TrashService {
  private readonly http = inject(HttpClient);

  /** Lista las raíces de la papelera, de la más reciente a la más antigua. */
  list(): Observable<TrashItem[]> {
    return this.http.get<TrashItem[]>(apiUrl('/trash'));
  }

  /**
   * Restaura un archivo o una carpeta.
   *
   * La API responde 409 si el padre sigue en papelera o si el nombre choca con
   * un hermano activo; la pantalla traduce ese caso a un mensaje claro.
   */
  restore(type: TrashResourceType, resourceId: string): Observable<FileItem | Folder> {
    return this.http.post<FileItem | Folder>(apiUrl(`/trash/${type}/${resourceId}/restore`), {});
  }

  /** Elimina definitivamente un recurso y devuelve los contadores de la purga. */
  purge(type: TrashResourceType, resourceId: string): Observable<TrashPurgeResponse> {
    return this.http.delete<TrashPurgeResponse>(apiUrl(`/trash/${type}/${resourceId}`));
  }

  /** Vacía por completo la papelera del usuario autenticado. */
  empty(): Observable<TrashPurgeResponse> {
    return this.http.delete<TrashPurgeResponse>(apiUrl('/trash'));
  }
}
