import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import type {
  TrashItem,
  TrashPurgeResponse,
  TrashResourceType,
} from '../../../core/models/trash.model';
import { StorageService } from '../../../core/services/storage.service';
import { TrashService } from '../../../core/services/trash.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableAction,
  type DataTableActionEvent,
  type DataTableColumn,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';

/** Acciones disponibles en el menú de cada elemento. */
const RESTORE_ACTION: DataTableAction = {
  id: 'restore',
  label: 'Restaurar',
  icon: 'restore',
};
const PURGE_ACTION: DataTableAction = {
  id: 'purge',
  label: 'Eliminar definitivamente',
  icon: 'delete_forever',
  danger: true,
};

/** Fila de la tabla de papelera. */
interface TrashRow extends DataTableRow {
  _id: string;
  _type: TrashResourceType;
  name: string;
  typeLabel: string;
  size: number | null;
  deletedAt: string | null;
}

/**
 * Pantalla de la papelera.
 *
 * `GET /api/trash` devuelve solo las raíces de cada borrado, es decir, los
 * archivos sueltos y las carpetas completas que se pueden restaurar o purgar.
 * Restaurar usa POST y puede responder 409 (padre en papelera o nombre
 * repetido); en ese caso se explica al usuario cómo resolverlo. Purgar y
 * vaciar la papelera son destructivos y siempre piden confirmación.
 */
@Component({
  selector: 'app-list-trash',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
  ],
  templateUrl: './list-trash.component.html',
  styleUrl: './list-trash.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListTrashComponent {
  private readonly trashService = inject(TrashService);
  private readonly storage = inject(StorageService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Raíces de la papelera del usuario autenticado. */
  readonly items = signal<readonly TrashItem[]>([]);
  readonly loading = signal(false);
  readonly emptying = signal(false);

  /** Clave "tipo:id" del recurso con una operación en curso. */
  readonly busyKey = signal<string | null>(null);

  readonly busy = computed(() => this.busyKey() !== null || this.emptying());

  readonly columns: readonly DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'typeLabel', label: 'Tipo', format: 'badge' },
    { key: 'size', label: 'Tamaño', format: 'size' },
    { key: 'deletedAt', label: 'Fecha de eliminación', format: 'date' },
  ];

  readonly actions: readonly DataTableAction[] = [RESTORE_ACTION, PURGE_ACTION];

  /** Filas con las etiquetas legibles que pinta la tabla compartida. */
  readonly rows = computed<readonly TrashRow[]>(() =>
    this.items().map((item) => ({
      _id: item._id,
      _type: item.type,
      name: item.name,
      typeLabel: item.type === 'folder' ? 'Carpeta' : 'Archivo',
      // Las carpetas no tienen un tamaño propio: la columna muestra "—".
      size: item.type === 'file' ? item.size : null,
      deletedAt: item.deletedAt,
    })),
  );

  readonly subtitle = computed(() => {
    const items = this.items();
    if (items.length === 0) {
      return 'Los archivos y carpetas eliminados aparecerán aquí.';
    }

    const folders = items.filter((item) => item.type === 'folder').length;
    const files = items.length - folders;
    return `${items.length} elemento(s) en la papelera (${folders} carpeta(s) y ${files} archivo(s)).`;
  });

  readonly emptyMessage = 'La papelera está vacía.';

  constructor() {
    this.loadItems();
  }

  /** Botón "Actualizar": vuelve a consultar la papelera. */
  reload(): void {
    this.loadItems();
  }

  /** Despacha restaurar o eliminar definitivamente según la acción elegida. */
  onAction(event: DataTableActionEvent): void {
    const item = this.findItem(event.row);
    if (!item || this.busy()) {
      return;
    }

    if (event.action === 'restore') {
      this.restoreItem(item);
    } else if (event.action === 'purge') {
      this.confirmPurge(item);
    }
  }

  /** Pide confirmación porque el vaciado es irreversible. */
  confirmEmpty(): void {
    if (this.items().length === 0 || this.busy()) {
      return;
    }

    const data: ConfirmDialogData = {
      title: 'Vaciar papelera',
      message:
        `Se eliminarán definitivamente ${this.items().length} elemento(s) de la papelera, ` +
        'incluido el contenido de las carpetas. Esta acción no se puede deshacer.',
      confirmText: 'Vaciar papelera',
      danger: true,
    };

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data,
        width: '28rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.emptyTrash();
        }
      });
  }

  /** Restaura un recurso sin confirmación: no destruye información. */
  private restoreItem(item: TrashItem): void {
    const key = this.itemKey(item);
    this.busyKey.set(key);

    this.trashService
      .restore(item.type, item._id)
      .pipe(finalize(() => this.busyKey.set(null)))
      .subscribe({
        next: () => {
          const message =
            item.type === 'folder'
              ? `Carpeta "${item.name}" restaurada junto con su contenido.`
              : `Archivo "${item.name}" restaurado.`;
          this.notify(message);
          this.loadItems(false);
        },
        error: (error: unknown) => {
          this.showRestoreError(error, item);
          // Un 404 o 409 suele indicar que la lista quedó desactualizada.
          this.loadItems(false);
        },
      });
  }

  /** Confirma y ejecuta la purga individual (DELETE /api/trash/:type/:id). */
  private confirmPurge(item: TrashItem): void {
    const message =
      item.type === 'folder'
        ? `La carpeta "${item.name}" y todo su contenido se eliminarán de forma permanente. Esta acción no se puede deshacer.`
        : `El archivo "${item.name}" se eliminará de forma permanente. Esta acción no se puede deshacer.`;

    const data: ConfirmDialogData = {
      title: 'Eliminar definitivamente',
      message,
      confirmText: 'Eliminar definitivamente',
      danger: true,
    };

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data,
        width: '28rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) {
          this.purgeItem(item);
        }
      });
  }

  /** Ejecuta la eliminación definitiva y muestra el espacio liberado. */
  private purgeItem(item: TrashItem): void {
    const key = this.itemKey(item);
    this.busyKey.set(key);

    this.trashService
      .purge(item.type, item._id)
      .pipe(finalize(() => this.busyKey.set(null)))
      .subscribe({
        next: (result) => {
          this.notify(this.purgeMessage(result));
          // La purga definitiva libera espacio: se actualiza la barra del sidenav.
          this.storage.refresh();
          this.loadItems(false);
        },
        error: (error: unknown) => {
          this.showError(error, `No se pudo eliminar definitivamente "${item.name}".`);
          this.loadItems(false);
        },
      });
  }

  /** Vacía la papelera completa (DELETE /api/trash). */
  private emptyTrash(): void {
    this.emptying.set(true);

    this.trashService
      .empty()
      .pipe(finalize(() => this.emptying.set(false)))
      .subscribe({
        next: (result) => {
          this.items.set([]);
          this.notify(this.purgeMessage(result));
          // Vaciar la papelera también libera el espacio de todos sus archivos.
          this.storage.refresh();
        },
        error: (error: unknown) => {
          this.showError(error, 'No se pudo vaciar la papelera.');
          this.loadItems(false);
        },
      });
  }

  /** Carga las raíces de la papelera. */
  private loadItems(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    this.trashService
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.items.set(items),
        error: (error: unknown) => {
          this.items.set([]);
          this.showError(error, 'No se pudo cargar la papelera.');
        },
      });
  }

  /**
   * Mensaje específico del 409 al restaurar: el backend no distingue en el
   * código entre padre en papelera y nombre repetido, así que se explican
   * ambas causas y la solución en un único aviso.
   */
  private showRestoreError(error: unknown, item: TrashItem): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      const conflict = item.type === 'folder' ? 'otra carpeta' : 'otro archivo';
      this.snackBar.open(
        `No se pudo restaurar "${item.name}": la carpeta que lo contiene sigue en la ` +
          `papelera o ya existe ${conflict} con ese nombre en su ubicación original. ` +
          'Restaura primero la carpeta padre o renombra el elemento activo que tiene ese nombre.',
        'Cerrar',
        { duration: 10000 },
      );
      return;
    }

    this.showError(error, `No se pudo restaurar "${item.name}".`);
  }

  /** Busca el documento original a partir de la fila de la tabla. */
  private findItem(row: DataTableRow): TrashItem | undefined {
    return this.items().find(
      (item) => item._id === String(row['_id']) && item.type === String(row['_type']),
    );
  }

  private itemKey(item: TrashItem): string {
    return `${item.type}:${item._id}`;
  }

  /** Resume la purga con contadores y bytes liberados. */
  private purgeMessage(result: TrashPurgeResponse): string {
    const parts: string[] = [];
    if (result.affectedFolders > 0) {
      parts.push(`${result.affectedFolders} carpeta(s)`);
    }
    if (result.affectedFiles > 0) {
      parts.push(`${result.affectedFiles} archivo(s)`);
    }

    const detail = parts.length > 0 ? `Se eliminaron ${parts.join(' y ')}. ` : '';
    return `${detail}Se liberaron ${this.formatBytes(result.freedBytes)} de almacenamiento.`;
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

  private notify(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 4000 });
  }

  /** Mensajes claros para 400/404 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    const message = apiErrorMessage(error, fallback, {
      badRequest: 'La operación no es válida. Actualiza la papelera e inténtalo de nuevo.',
      notFound: 'El recurso ya no está en la papelera. Actualiza la lista.',
    });

    this.snackBar.open(message, 'Cerrar', { duration: 6000 });
  }
}
