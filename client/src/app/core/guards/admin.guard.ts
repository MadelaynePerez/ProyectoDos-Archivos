import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';

import { AuthService } from '../services/auth.service';

/**
 * Restringe una ruta al rol ADMIN.
 * Un usuario autenticado sin permisos vuelve a "Mis archivos"; sin sesión va
 * al login. El backend vuelve a validar el rol en cada endpoint.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  return auth.isAdmin() ? true : router.createUrlTree(['/files']);
};
