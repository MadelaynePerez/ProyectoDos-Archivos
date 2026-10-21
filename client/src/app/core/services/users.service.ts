import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { apiUrl } from '../api/api';
import type { UpdateUserRequest, User } from '../models/user.model';

/**
 * Servicio de administración de usuarios.
 *
 * Solo los endpoints de `GET /api/users` y `PATCH /api/users/:id` existen en
 * el contrato. El JWT lo agrega el interceptor global y el backend vuelve a
 * validar que el usuario autenticado tenga rol ADMIN.
 */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  /** Lista todos los usuarios, activos e inactivos, del más reciente al más antiguo. */
  list(): Observable<User[]> {
    return this.http.get<User[]>(apiUrl('/users'));
  }

  /** Cambia el rol y/o el estado de una cuenta. */
  update(userId: string, changes: UpdateUserRequest): Observable<User> {
    return this.http.patch<User>(apiUrl(`/users/${userId}`), changes);
  }
}
