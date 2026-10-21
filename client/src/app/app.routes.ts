import type { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

/**
 * Rutas de la aplicación con lazy loading.
 *
 * - `/login` es pública.
 * - El layout privado se carga de forma diferida y protege a sus hijas con
 *   `authGuard`.
 * - `/users` agrega `adminGuard`: solo el rol ADMIN puede abrir el panel.
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Gestión Documental',
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'files' },
      {
        path: 'files',
        title: 'Mis archivos · Gestión Documental',
        loadComponent: () =>
          import('./features/files/files.page').then((m) => m.FilesPage),
      },
      {
        path: 'shared-with-me',
        title: 'Compartido conmigo · Gestión Documental',
        loadComponent: () =>
          import('./features/shared-with-me/shared-with-me.page').then(
            (m) => m.SharedWithMePage,
          ),
      },
      {
        path: 'shared-by-me',
        title: 'Compartido por mí · Gestión Documental',
        loadComponent: () =>
          import('./features/shared-by-me/shared-by-me.page').then(
            (m) => m.SharedByMePage,
          ),
      },
      {
        path: 'trash',
        title: 'Papelera · Gestión Documental',
        loadComponent: () =>
          import('./features/trash/trash.page').then((m) => m.TrashPage),
      },
      {
        path: 'activity',
        title: 'Actividad · Gestión Documental',
        loadComponent: () =>
          import('./features/activity/activity.page').then((m) => m.ActivityPage),
      },
      {
        path: 'reports',
        title: 'Reportes · Gestión Documental',
        loadComponent: () =>
          import('./features/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'users',
        title: 'Usuarios · Gestión Documental',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./features/users/users.page').then((m) => m.UsersPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
