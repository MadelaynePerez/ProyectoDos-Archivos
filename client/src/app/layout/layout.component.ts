import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService } from '../core/auth/auth.service';

/** Elemento del menú lateral. */
interface NavItem {
  label: string;
  icon: string;
  route: string;
  adminOnly?: boolean;
}

/** Opciones comunes a todos los usuarios. */
const BASE_NAV_ITEMS: readonly NavItem[] = [
  { label: 'Mis archivos', icon: 'folder', route: '/files' },
  { label: 'Compartido conmigo', icon: 'call_received', route: '/shared-with-me' },
  { label: 'Compartido por mí', icon: 'call_made', route: '/shared-by-me' },
  { label: 'Papelera', icon: 'delete', route: '/trash' },
  { label: 'Actividad', icon: 'history', route: '/activity' },
  { label: 'Reportes', icon: 'bar_chart', route: '/reports' },
];

/**
 * Layout privado: toolbar superior + sidenav con las secciones.
 * "Usuarios" solo se agrega para el rol ADMIN; el guard de la ruta lo vuelve
 * a verificar aunque alguien escriba la URL a mano.
 */
@Component({
  selector: 'app-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatDividerModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
  readonly auth = inject(AuthService);

  /** Estado del sidenav (se puede plegar con el botón del toolbar). */
  readonly sidenavOpened = signal(true);

  /** Menú visible según el rol del usuario autenticado. */
  readonly navItems = computed<readonly NavItem[]>(() =>
    this.auth.isAdmin()
      ? [
          ...BASE_NAV_ITEMS,
          {
            label: 'Usuarios',
            icon: 'group',
            route: '/users',
            adminOnly: true,
          },
        ]
      : BASE_NAV_ITEMS,
  );

  toggleSidenav(): void {
    this.sidenavOpened.update((opened) => !opened);
  }

  /** En pantallas angostas se cierra el menú después de navegar. */
  closeOnNavigate(): void {
    if (globalThis.innerWidth <= 960) {
      this.sidenavOpened.set(false);
    }
  }

  /** Inicial para el avatar del usuario. */
  initial(name: string): string {
    return name.trim().charAt(0).toUpperCase() || '?';
  }

  logout(): void {
    this.auth.logout();
  }
}
