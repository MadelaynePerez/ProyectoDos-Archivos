import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { AuthResponse, LoginRequest, User } from '../models/user.model';

/** Claves usadas en localStorage para persistir la sesión. */
const TOKEN_KEY = 'gd_access_token';
const USER_KEY = 'gd_user';

/**
 * Servicio de autenticación y sesión.
 *
 * Mantiene el usuario actual en un signal para que el layout y los guards
 * reaccionen sin recargar la página, y persiste token + usuario en
 * localStorage para sobrevivir a un refresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** Signal privado: solo se modifica desde login/logout. */
  private readonly userSignal = signal<User | null>(this.readStoredUser());

  /** Usuario autenticado (solo lectura para el resto de la app). */
  readonly currentUser = this.userSignal.asReadonly();

  /** Hay sesión válida cuando existen usuario y token guardados. */
  readonly isAuthenticated = computed(
    () => this.userSignal() !== null && this.getToken() !== null,
  );

  /** Solo el rol ADMIN puede entrar al panel de usuarios. */
  readonly isAdmin = computed(() => this.userSignal()?.role === 'ADMIN');

  /**
   * Llama a `POST /api/auth/login`, guarda la respuesta y actualiza el signal.
   * Devuelve el usuario para que el componente pueda navegar al terminar.
   */
  login(credentials: LoginRequest): Observable<User> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, credentials)
      .pipe(
        tap((response) => this.storeSession(response)),
        map((response) => response.user),
      );
  }

  /**
   * Cierra la sesión local. Por defecto vuelve al login; el interceptor
   * desactiva la redirección cuando ya está en esa ruta o cuando la maneja él.
   */
  logout(redirectToLogin = true): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.userSignal.set(null);

    if (redirectToLogin && !this.router.url.startsWith('/login')) {
      void this.router.navigate(['/login']);
    }
  }

  /** Token actual para el interceptor HTTP. */
  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  /** Guarda token y usuario de forma consistente. */
  private storeSession(response: AuthResponse): void {
    localStorage.setItem(TOKEN_KEY, response.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.userSignal.set(response.user);
  }

  /**
   * Recupera el usuario persistido al arrancar la app.
   * Si el JSON está corrupto se limpia la sesión en lugar de romper el arranque.
   */
  private readStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as User;
    } catch {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
      return null;
    }
  }
}
