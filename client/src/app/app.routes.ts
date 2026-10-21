import type { Routes } from '@angular/router';

import { adminGuard } from './core/guards/admin.guard';
import { authGuard } from './core/guards/auth.guard';

/**
 * Rutas de la aplicación con lazy loading.
 *
 * - `/login` y `/register` son públicas.
 * - El layout privado se carga de forma diferida y protege a sus hijas con
 *   `authGuard`.
 * - `/users` agrega `adminGuard`: solo el rol ADMIN puede abrir el panel.
 */
export const routes: Routes = [
  {
    path: 'login',
    title: 'Iniciar sesión · Gestión Documental',
    loadComponent: () =>
      import('./pages/login/list-login/list-login.component').then((m) => m.ListLoginComponent),
  },
  {
    path: 'register',
    title: 'Crear cuenta · Gestión Documental',
    loadComponent: () =>
      import('./pages/login/register/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shared/layout/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'files' },
      {
        path: 'files',
        title: 'Mis archivos · Gestión Documental',
        loadComponent: () =>
          import('./pages/explorer/list-explorer/list-explorer.component').then(
            (m) => m.ListExplorerComponent,
          ),
      },
      {
        path: 'shared-with-me',
        title: 'Compartido conmigo · Gestión Documental',
        loadComponent: () =>
          import('./pages/shared-with-me/list-shared-with-me/list-shared-with-me.component').then(
            (m) => m.ListSharedWithMeComponent,
          ),
      },
      {
        path: 'shared-by-me',
        title: 'Compartido por mí · Gestión Documental',
        loadComponent: () =>
          import('./pages/shared-by-me/list-shared-by-me/list-shared-by-me.component').then(
            (m) => m.ListSharedByMeComponent,
          ),
      },
      {
        path: 'trash',
        title: 'Papelera · Gestión Documental',
        loadComponent: () =>
          import('./pages/trash/list-trash/list-trash.component').then((m) => m.ListTrashComponent),
      },
      {
        path: 'activity',
        title: 'Actividad · Gestión Documental',
        loadComponent: () =>
          import('./pages/activity/list-activity/list-activity.component').then(
            (m) => m.ListActivityComponent,
          ),
      },
      {
        path: 'reports',
        title: 'Reportes · Gestión Documental',
        loadComponent: () =>
          import('./pages/reports/list-reports/list-reports.component').then(
            (m) => m.ListReportsComponent,
          ),
      },
      {
        path: 'users',
        title: 'Usuarios · Gestión Documental',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/users/list-users/list-users.component').then((m) => m.ListUsersComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
