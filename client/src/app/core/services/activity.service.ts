import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type { ActivityListResponse, ListActivityQuery } from '../models/activity.model';

/**
 * Servicio del historial de actividad.
 *
 * El backend siempre filtra por el `actorId` del JWT, por eso no se envía un
 * usuario: cada cuenta solo puede consultar su propio historial. La paginación
 * se resuelve en el servidor con `page` y `limit`.
 */
@Injectable({ providedIn: 'root' })
export class ActivityService {
  private readonly http = inject(HttpClient);

  /** Lista el historial paginado, opcionalmente acotado por rango de fechas. */
  list(query: ListActivityQuery = {}): Observable<ActivityListResponse> {
    let params = new HttpParams();

    if (query.from) {
      params = params.set('from', query.from);
    }
    if (query.to) {
      params = params.set('to', query.to);
    }
    if (query.page) {
      params = params.set('page', String(query.page));
    }
    if (query.limit) {
      params = params.set('limit', String(query.limit));
    }

    return this.http.get<ActivityListResponse>(apiUrl('/activity'), { params });
  }
}
