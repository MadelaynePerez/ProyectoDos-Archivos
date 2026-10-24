import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type {
  FileItem,
  ListFilesQuery,
  MoveFileRequest,
  RenameFileRequest,
} from '../models/file.model';

/**
 * Servicio de archivos `.txt` y `.md`.
 *
 * La subida y la descarga pasan por `HttpClient`; el interceptor global agrega
 * el token Bearer en ambas operaciones.
 */
@Injectable({ providedIn: 'root' })
export class FilesService {
  private readonly http = inject(HttpClient);

  /** Lista archivos con búsqueda, extensión y orden según el contrato. */
  list(query: ListFilesQuery = {}): Observable<FileItem[]> {
    let params = new HttpParams();

    if (query.folderId) {
      params = params.set('folderId', query.folderId);
    }

    const search = query.search?.trim();
    if (search) {
      params = params.set('search', search);
    }

    if (query.extension) {
      params = params.set('extension', query.extension);
    }

    if (query.sortBy) {
      params = params.set('sortBy', query.sortBy);
    }

    if (query.sortOrder) {
      params = params.set('sortOrder', query.sortOrder);
    }

    return this.http.get<FileItem[]>(apiUrl('/files'), { params });
  }

  /**
   * Sube un archivo con `multipart/form-data`.
   * No se fija `Content-Type`: el navegador debe agregar el boundary.
   */
  upload(file: File, folderId: string | null): Observable<FileItem> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    if (folderId) {
      formData.append('folderId', folderId);
    }

    return this.http.post<FileItem>(apiUrl('/files'), formData);
  }

  /**
   * Reemplaza el contenido de un archivo existente con `PUT /api/files/:id/content`.
   *
   * El archivo debe conservar la extensión actual. Igual que en la subida, no
   * se fija `Content-Type`: el navegador agrega el boundary del multipart.
   */
  updateContent(fileId: string, file: File): Observable<FileItem> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return this.http.put<FileItem>(apiUrl(`/files/${fileId}/content`), formData);
  }

  /**
   * Descarga el contenido como blob.
   *
   * `responseType: 'blob'` evita que Angular intente interpretar el texto y el
   * interceptor adjunta el token igual que en cualquier otra petición.
   */
  download(fileId: string): Observable<Blob> {
    return this.http.get(apiUrl(`/files/${fileId}/download`), {
      responseType: 'blob',
    });
  }

  /** Renombra el archivo; el backend conserva la extensión original. */
  rename(fileId: string, name: string): Observable<FileItem> {
    const body: RenameFileRequest = { name };
    return this.http.patch<FileItem>(apiUrl(`/files/${fileId}/rename`), body);
  }

  /** Mueve el archivo a otra carpeta; `null` lo lleva a la raíz. */
  move(fileId: string, newFolderId: string | null): Observable<FileItem> {
    const body: MoveFileRequest = { newFolderId };
    return this.http.patch<FileItem>(apiUrl(`/files/${fileId}/move`), body);
  }

  /** Envía el archivo a la papelera (soft delete). */
  remove(fileId: string): Observable<FileItem> {
    return this.http.delete<FileItem>(apiUrl(`/files/${fileId}`));
  }
}
