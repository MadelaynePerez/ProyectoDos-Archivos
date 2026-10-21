import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type {
  CreateShareRequest,
  RevokeShareResponse,
  ShareAccess,
  ShareDocument,
  ShareListItem,
  ShareResourceType,
  UpdateShareRequest,
} from '../models/share.model';

/**
 * Servicio de comparticiones.
 *
 * El backend deriva el propietario y el destinatario del JWT y del body; el
 * cliente nunca envía `ownerId`. Para cambiar un permiso existente se usa el
 * mismo documento mediante PATCH, tal como exige el contrato.
 */
@Injectable({ providedIn: 'root' })
export class SharesService {
  private readonly http = inject(HttpClient);

  /** Concede un permiso o actualiza el existente para el mismo destinatario. */
  create(request: CreateShareRequest): Observable<ShareDocument> {
    return this.http.post<ShareDocument>(apiUrl('/shares'), request);
  }

  /** Cambia el nivel de acceso de una compartición propia. */
  update(shareId: string, access: ShareAccess): Observable<ShareDocument> {
    const body: UpdateShareRequest = { access };
    return this.http.patch<ShareDocument>(apiUrl(`/shares/${shareId}`), body);
  }

  /** Retira una compartición propia. */
  revoke(shareId: string): Observable<RevokeShareResponse> {
    return this.http.delete<RevokeShareResponse>(apiUrl(`/shares/${shareId}`));
  }

  /** Permisos concedidos por el usuario autenticado. */
  sharedByMe(): Observable<ShareListItem[]> {
    return this.http.get<ShareListItem[]>(apiUrl('/shares/shared-by-me'));
  }

  /** Permisos recibidos por el usuario autenticado. */
  sharedWithMe(): Observable<ShareListItem[]> {
    return this.http.get<ShareListItem[]>(apiUrl('/shares/shared-with-me'));
  }

  /**
   * Permisos actuales de un recurso concreto.
   *
   * El contrato no expone un GET por recurso, así que se reutiliza el listado
   * "compartido por mí" y se filtra en cliente. Solo el propietario puede
   * administrar sus shares, por lo que el resultado es exactamente el suyo.
   */
  listForResource(
    resourceType: ShareResourceType,
    resourceId: string,
  ): Observable<ShareListItem[]> {
    return this.sharedByMe().pipe(
      map((shares) =>
        shares.filter(
          (share) => share.resourceType === resourceType && share.resourceId === resourceId,
        ),
      ),
    );
  }
}
