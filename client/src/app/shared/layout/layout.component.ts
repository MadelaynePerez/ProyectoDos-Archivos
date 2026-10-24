import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';

import { AuthService } from '../../core/services/auth.service';
import { StorageService } from '../../core/services/storage.service';

/** Equivalencia usada para mostrar la cuota en MB. */
const BYTES_PER_MB = 1024 * 1024;

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
    MatProgressBarModule,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent {
  readonly auth = inject(AuthService);
  readonly storage = inject(StorageService);

  /** Estado del sidenav (se puede plegar con el botón del toolbar). */
  readonly sidenavOpened = signal(true);

  /** Porcentaje ocupado de la cuota, acotado a 100 para la barra. */
  readonly storagePercent = computed(() => {
    const usage = this.storage.usage();
    if (!usage || usage.quota <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((usage.used / usage.quota) * 1000) / 10);
  });

  /** La barra pasa a "warn" cuando queda poco espacio disponible. */
  readonly storageColor = computed<'primary' | 'warn'>(() =>
    this.storagePercent() >= 90 ? 'warn' : 'primary',
  );

  /** Texto "X de Y usados" del resumen del sidenav, con unidad legible. */
  readonly storageUsedLabel = computed(() => this.formatSize(this.storage.usage()?.used ?? 0));
  readonly storageQuotaLabel = computed(() => this.formatSize(this.storage.usage()?.quota ?? 0));
  readonly storageAvailableLabel = computed(() =>
    this.formatSize(this.storage.usage()?.available ?? 0),
  );

  constructor() {
    // El layout vive durante toda la sesión: se limpia cualquier valor de una
    // sesión anterior, se carga la cuota y luego se refresca desde las
    // pantallas que modifican el almacenamiento.
    this.storage.reset();
    this.storage.refresh();
  }

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

  /**
   * Convierte bytes a la unidad más legible (B, KB o MB).
   *
   * El uso real del seed es de pocos KB: mostrarlo siempre en MB hacía que
   * apareciera "0.0 MB" y pareciera que la cuota no estaba funcionando.
   */
  private formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${Math.round(bytes)} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }

  logout(): void {
    this.auth.logout();
  }
}
