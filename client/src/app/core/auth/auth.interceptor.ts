import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Interceptor funcional de autenticación:
 * 1. Agrega `Authorization: Bearer <token>` a cada request si hay sesión.
 * 2. Ante un 401 cierra la sesión y redirige al login.
 *
 * Los endpoints públicos de auth se excluyen del manejo de 401 para que la
 * pantalla de login pueda mostrar el mensaje de credenciales inválidas en
 * lugar de recargarse a sí misma.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  // Clona la petición: las HttpRequest son inmutables.
  const authRequest = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authRequest).pipe(
    catchError((error: unknown) => {
      const isPublicAuthRequest = request.url.includes('/auth/');

      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        !isPublicAuthRequest
      ) {
        // Limpia localStorage y el signal; la redirección se hace aquí para
        // conservar la URL actual como returnUrl.
        auth.logout(false);
        if (!router.url.startsWith('/login')) {
          void router.navigate(['/login'], {
            queryParams: { returnUrl: router.url },
          });
        }
      }

      return throwError(() => error);
    }),
  );
};
