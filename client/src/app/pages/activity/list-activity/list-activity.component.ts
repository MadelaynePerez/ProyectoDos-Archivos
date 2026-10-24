import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import type { PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import { activityActionLabel, type ActivityEvent } from '../../../core/models/activity.model';
import { ActivityService } from '../../../core/services/activity.service';
import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';
import { FiltersComponent, type FiltersValue } from '../../../shared/filters/filters.component';

/** Fila de la tabla de actividad. */
interface ActivityRow extends DataTableRow {
  _id: string;
  createdAt: string;
  actionLabel: string;
  resource: string;
  detail: string;
}

/**
 * Historial de actividad del usuario autenticado.
 *
 * La API pagina en servidor: se envían `page` (desde 1) y `limit` junto con el
 * rango opcional `from`/`to`. Por eso la tabla se usa en modo servidor: recibe
 * solo los eventos de la página actual y el total para el paginador.
 */
@Component({
  selector: 'app-list-activity',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
    FiltersComponent,
  ],
  templateUrl: './list-activity.component.html',
  styleUrl: './list-activity.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListActivityComponent {
  private readonly activityService = inject(ActivityService);
  private readonly snackBar = inject(MatSnackBar);

  /** Eventos de la página actual. */
  readonly events = signal<readonly ActivityEvent[]>([]);
  readonly loading = signal(false);

  /** Total de eventos que cumplen el filtro (no solo la página actual). */
  readonly total = signal(0);

  /** MatPaginator trabaja con base 0; la API con base 1. */
  readonly pageIndex = signal(0);
  readonly pageSize = signal(20);
  readonly pageSizeOptions: readonly number[] = [10, 20, 50, 100];

  /** Rango de fechas activo; `null` significa sin límite. */
  readonly filters = signal<FiltersValue>({
    search: '',
    userId: '',
    from: null,
    to: null,
  });

  readonly columns: readonly DataTableColumn[] = [
    { key: 'createdAt', label: 'Fecha', format: 'date' },
    { key: 'actionLabel', label: 'Acción' },
    { key: 'resource', label: 'Recurso' },
    { key: 'detail', label: 'Detalle' },
  ];

  /** Convierte cada evento en una fila legible para la tabla compartida. */
  readonly rows = computed<readonly ActivityRow[]>(() =>
    this.events().map((event) => ({
      _id: event._id,
      createdAt: event.createdAt,
      actionLabel: activityActionLabel(event.action),
      resource: event.resourceName || '—',
      detail: this.buildDetail(event),
    })),
  );

  readonly subtitle = computed(() => {
    const total = this.total();
    if (total === 0) {
      return 'Consulta las acciones realizadas sobre tus archivos y carpetas.';
    }
    return `${total} evento(s) registrado(s) en tu historial.`;
  });

  readonly emptyMessage = computed(() => {
    const { from, to } = this.filters();
    return from || to
      ? 'No hay actividad registrada en el rango de fechas seleccionado.'
      : 'Todavía no hay actividad registrada en tu cuenta.';
  });

  constructor() {
    this.loadActivity();
  }

  /** Botón "Actualizar": recarga la página actual. */
  reload(): void {
    this.loadActivity();
  }

  /** Aplica el rango de fechas y vuelve a la primera página. */
  onFiltersChange(value: FiltersValue): void {
    this.filters.set(value);
    this.pageIndex.set(0);
    this.loadActivity();
  }

  /** Cambio de página o de tamaño: consulta de nuevo el servidor. */
  onPageChange(event: PageEvent): void {
    // Al cambiar el tamaño de página se vuelve al inicio para no quedar fuera
    // del rango de páginas que devuelve la API.
    this.pageIndex.set(event.pageSize === this.pageSize() ? event.pageIndex : 0);
    this.pageSize.set(event.pageSize);
    this.loadActivity();
  }

  /** Consulta `GET /api/activity` con los filtros y la paginación activos. */
  private loadActivity(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    const { from, to } = this.filters();

    this.activityService
      .list({
        from: from ?? undefined,
        to: to ?? undefined,
        page: this.pageIndex() + 1,
        limit: this.pageSize(),
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (response) => {
          // Si la página quedó vacía tras una purga, retrocede a la última
          // página válida en lugar de mostrar una tabla vacía con total > 0.
          if (response.items.length === 0 && response.total > 0 && this.pageIndex() > 0) {
            this.pageIndex.set(Math.max(0, response.totalPages - 1));
            this.loadActivity(false);
            return;
          }

          this.events.set(response.items);
          this.total.set(response.total);
        },
        error: (error: unknown) => {
          this.events.set([]);
          this.total.set(0);
          this.showError(error, 'No se pudo cargar el historial de actividad.');
        },
      });
  }

  /**
   * Construye el detalle legible a partir de `metadata`.
   *
   * No se muestran ObjectIds crudos: se prioriza la información útil para el
   * usuario (tamaño, extensión, permiso, contadores o nombre anterior).
   */
  private buildDetail(event: ActivityEvent): string {
    const metadata = event.metadata ?? {};

    switch (event.action) {
      case 'AUTH_LOGIN': {
        const ip = this.textValue(metadata, 'ip');
        return ip ? `IP: ${ip}` : 'Inicio de sesión correcto.';
      }

      case 'FILE_UPLOAD':
      case 'FILE_DOWNLOAD':
      case 'FILE_DELETE': {
        const parts: string[] = [];
        const extension = this.textValue(metadata, 'extension');
        const size = this.numberValue(metadata, 'size');

        if (extension) {
          parts.push(`Extensión: .${extension}`);
        }
        if (size !== null) {
          parts.push(`Tamaño: ${this.formatBytes(size)}`);
        }

        return parts.join(' · ') || '—';
      }

      case 'FILE_RENAME':
      case 'FOLDER_RENAME': {
        const previousName = this.textValue(metadata, 'previousName');
        return previousName ? `Nombre anterior: "${previousName}".` : '—';
      }

      case 'FILE_MOVE': {
        const toFolderId = this.textValue(metadata, 'toFolderId');
        return toFolderId ? 'Movido a otra carpeta.' : 'Movido a la raíz.';
      }

      case 'FOLDER_MOVE': {
        const toParentId = this.textValue(metadata, 'toParentId');
        return toParentId ? 'Movida a otra carpeta.' : 'Movida a la raíz.';
      }

      case 'FILE_UPDATE': {
        const size = this.numberValue(metadata, 'size');
        return size !== null
          ? `Nuevo tamaño: ${this.formatBytes(size)}.`
          : 'Contenido reemplazado.';
      }

      case 'FILE_RESTORE':
        return 'Restaurado desde la papelera.';

      case 'FOLDER_CREATE':
        return this.textValue(metadata, 'parentId')
          ? 'Creada dentro de otra carpeta.'
          : 'Creada en la raíz.';

      case 'FOLDER_DELETE': {
        const folders = this.numberValue(metadata, 'affectedFolders') ?? 0;
        const files = this.numberValue(metadata, 'affectedFiles') ?? 0;
        return `${folders} carpeta(s) y ${files} archivo(s) enviados a la papelera.`;
      }

      case 'FOLDER_RESTORE': {
        const folders = this.numberValue(metadata, 'affectedFolders') ?? 0;
        const files = this.numberValue(metadata, 'affectedFiles') ?? 0;
        return `${folders} carpeta(s) y ${files} archivo(s) restaurados.`;
      }

      case 'FILE_PURGE':
      case 'FOLDER_PURGE':
      case 'TRASH_EMPTY': {
        const folders = this.numberValue(metadata, 'affectedFolders') ?? 0;
        const files = this.numberValue(metadata, 'affectedFiles') ?? 0;
        const freed = this.numberValue(metadata, 'freedBytes') ?? 0;
        const counters =
          folders > 0 || files > 0
            ? `${folders} carpeta(s) y ${files} archivo(s) eliminados. `
            : '';
        return `${counters}Se liberaron ${this.formatBytes(freed)}.`;
      }

      case 'SHARE_GRANT': {
        const access = this.textValue(metadata, 'access');
        return access ? `Permiso ${access} concedido.` : 'Permiso concedido.';
      }

      case 'SHARE_UPDATE': {
        const access = this.textValue(metadata, 'access');
        const previousAccess = this.textValue(metadata, 'previousAccess');
        return previousAccess && access
          ? `Permiso: ${previousAccess} → ${access}.`
          : 'Permiso actualizado.';
      }

      case 'SHARE_REVOKE':
        return 'Permiso retirado.';

      case 'USER_CREATE':
      case 'USER_UPDATE':
      case 'USER_ACTIVATE':
      case 'USER_DEACTIVATE': {
        const parts: string[] = [];
        const email = this.textValue(metadata, 'email');
        const role = this.textValue(metadata, 'role');
        if (email) {
          parts.push(email);
        }
        if (role) {
          parts.push(`Rol: ${role}`);
        }
        return parts.join(' · ') || '—';
      }

      default:
        return '—';
    }
  }

  /** Lee un valor de texto de `metadata` sin romper con valores nulos. */
  private textValue(metadata: Record<string, unknown>, key: string): string | null {
    const value = metadata[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }

  /** Lee un valor numérico de `metadata`. */
  private numberValue(metadata: Record<string, unknown>, key: string): number | null {
    const value = metadata[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  /** Convierte bytes a una unidad legible (B, KB o MB). */
  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return '0 B';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Mensajes claros para 400/401 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    const message = apiErrorMessage(error, fallback, {
      badRequest: 'El rango de fechas o la paginación no son válidos. Revisa los filtros.',
    });

    this.snackBar.open(message, 'Cerrar', { duration: 6000 });
  }
}
