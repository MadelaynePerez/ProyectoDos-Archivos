import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  EMPTY,
  expand,
  forkJoin,
  map,
  Observable,
  reduce,
} from 'rxjs';

import { apiUrl } from '../api/api';
import type {
  CreateFolderRequest,
  DeleteFolderResponse,
  Folder,
  MoveFolderRequest,
  RenameFolderRequest,
} from '../models/folder.model';

/**
 * Servicio de carpetas.
 *
 * Todas las peticiones llevan el JWT mediante el interceptor global. El dueño
 * lo resuelve el backend a partir del token, por eso nunca se envía `ownerId`.
 */
@Injectable({ providedIn: 'root' })
export class FoldersService {
  private readonly http = inject(HttpClient);

  /** Lista las subcarpetas activas de un padre; sin id lista la raíz. */
  list(parentId: string | null = null): Observable<Folder[]> {
    let params = new HttpParams();
    if (parentId) {
      params = params.set('parentId', parentId);
    }

    return this.http.get<Folder[]>(apiUrl('/folders'), { params });
  }

  /** Crea una carpeta dentro del padre indicado o en la raíz. */
  create(name: string, parentId: string | null): Observable<Folder> {
    const body: CreateFolderRequest = { name, parentId };
    return this.http.post<Folder>(apiUrl('/folders'), body);
  }

  /** Renombra una carpeta conservando su ubicación. */
  rename(folderId: string, name: string): Observable<Folder> {
    const body: RenameFolderRequest = { name };
    return this.http.patch<Folder>(apiUrl(`/folders/${folderId}/rename`), body);
  }

  /** Mueve una carpeta y su subárbol; `null` la lleva a la raíz. */
  move(folderId: string, newParentId: string | null): Observable<Folder> {
    const body: MoveFolderRequest = { newParentId };
    return this.http.patch<Folder>(apiUrl(`/folders/${folderId}/move`), body);
  }

  /** Envía la carpeta y todo su contenido a la papelera. */
  remove(folderId: string): Observable<DeleteFolderResponse> {
    return this.http.delete<DeleteFolderResponse>(apiUrl(`/folders/${folderId}`));
  }

  /**
   * Carga el árbol completo de carpetas del usuario.
   *
   * La API solo lista un nivel por petición, así que se recorren los hijos de
   * forma recursiva con `expand`. Se usa en el diálogo de mover para ofrecer
   * todos los destinos posibles.
   */
  listAll(): Observable<Folder[]> {
    return this.list(null).pipe(
      expand((folders) =>
        folders.length
          ? forkJoin(
              folders.map((folder) => this.list(folder._id)),
            ).pipe(map((childBatches) => childBatches.flat()))
          : EMPTY,
      ),
      reduce(
        (all: Folder[], folders: Folder[]) => [...all, ...folders],
        [] as Folder[],
      ),
    );
  }
}
