import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import {
  SHARE_ACCESS_LABELS,
  type ShareAccess,
  type ShareListItem,
} from '../../../core/models/share.model';
import { SharesService } from '../../../core/services/shares.service';
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
import {
  ChangeAccessDialogComponent,
  type ChangeAccessDialogData,
} from '../components/change-access-dialog/change-access-dialog.component';

/** Acciones disponibles sobre cada permiso concedido. */
const CHANGE_ACCESS_ACTION: DataTableAction = {
  id: 'change-access',
  label: 'Cambiar permiso',
  icon: 'tune',
};
const REVOKE_ACTION: DataTableAction = {
  id: 'revoke',
  label: 'Retirar permiso',
  icon: 'person_remove',
  danger: true,
};

/** Fila de la tabla de permisos concedidos. */
interface SharedByMeRow extends DataTableRow {
  _id: string;
  _shareId: string;
  name: string;
  resourceName: string;
  resourceTypeLabel: string;
  access: ShareAccess;
  granteeName: string;
  granteeEmail: string;
  createdAt: string;
}

/**
 * Pantalla "Compartido por mí".
 *
 * Lista los permisos que el usuario autenticado concedió sobre sus recursos.
 * Desde cada fila se puede cambiar el nivel (PATCH) o retirar el permiso
 * (DELETE), siempre mediante el id de la compartición.
 */
@Component({
  selector: 'app-list-shared-by-me',
  imports: [MatCardModule, MatProgressBarModule, DataTableComponent],
  templateUrl: './list-shared-by-me.component.html',
  styleUrl: './list-shared-by-me.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSharedByMeComponent {
  private readonly sharesService = inject(SharesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  readonly shares = signal<readonly ShareListItem[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);

  readonly columns: readonly DataTableColumn[] = [
    { key: 'resourceName', label: 'Recurso' },
    { key: 'resourceTypeLabel', label: 'Tipo', format: 'badge' },
    { key: 'access', label: 'Permiso', format: 'badge' },
    { key: 'granteeName', label: 'Destinatario' },
    { key: 'createdAt', label: 'Fecha', format: 'date' },
  ];

  readonly actions: readonly DataTableAction[] = [CHANGE_ACCESS_ACTION, REVOKE_ACTION];

  /** Filas con los datos que consume la tabla compartida. */
  readonly rows = computed<readonly SharedByMeRow[]>(() =>
    this.shares().map((share) => {
      const granteeName = share.grantee?.name ?? share.grantee?.email ?? 'Usuario eliminado';

      return {
        _id: share._id,
        _shareId: share._id,
        name: share.resourceName,
        resourceName: share.resourceName,
        resourceTypeLabel: share.resourceType === 'FOLDER' ? 'Carpeta' : 'Archivo',
        access: share.access,
        granteeName,
        granteeEmail: share.grantee?.email ?? '',
        createdAt: share.createdAt,
      };
    }),
  );

  readonly emptyMessage = 'Todavía no has compartido archivos ni carpetas con otros usuarios.';

  constructor() {
    this.loadShares();
  }

  /** Despacha las acciones de cambiar nivel o retirar permiso. */
  onAction(event: DataTableActionEvent): void {
    const share = this.shares().find((item) => item._id === String(event.row['_shareId']));
    if (!share || this.busy()) {
      return;
    }

    if (event.action === 'change-access') {
      this.openChangeAccessDialog(share);
    } else if (event.action === 'revoke') {
      this.confirmRevoke(share);
    }
  }

  /** Abre el diálogo y, si cambia el nivel, ejecuta PATCH. */
  private openChangeAccessDialog(share: ShareListItem): void {
    const granteeName = share.grantee?.name ?? share.grantee?.email ?? 'el destinatario';
    const data: ChangeAccessDialogData = {
      resourceName: share.resourceName,
      granteeName,
      access: share.access,
    };

    this.dialog
      .open<ChangeAccessDialogComponent, ChangeAccessDialogData, ShareAccess | null>(
        ChangeAccessDialogComponent,
        {
          data,
          width: '26rem',
          maxWidth: '95vw',
        },
      )
      .afterClosed()
      .subscribe((access) => {
        if (!access || access === share.access) {
          return;
        }

        this.busy.set(true);
        this.sharesService
          .update(share._id, access)
          .pipe(finalize(() => this.busy.set(false)))
          .subscribe({
            next: (updated) => {
              this.notify(
                `Permiso de ${granteeName} actualizado a ${SHARE_ACCESS_LABELS[updated.access]}.`,
              );
              this.loadShares(false);
            },
            error: (error: unknown) => this.showError(error, 'No se pudo cambiar el permiso.'),
          });
      });
  }

  /** Confirma y retira el permiso mediante DELETE. */
  private confirmRevoke(share: ShareListItem): void {
    const granteeName = share.grantee?.name ?? share.grantee?.email ?? 'el destinatario';

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Retirar permiso',
          message:
            `${granteeName} dejará de tener acceso a "${share.resourceName}". ` +
            'Si el permiso era heredado, también dejará de aplicar a su contenido.',
          confirmText: 'Retirar',
          danger: true,
        },
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.busy.set(true);
        this.sharesService
          .revoke(share._id)
          .pipe(finalize(() => this.busy.set(false)))
          .subscribe({
            next: () => {
              this.notify(`Permiso de ${granteeName} retirado.`);
              this.loadShares(false);
            },
            error: (error: unknown) => this.showError(error, 'No se pudo retirar el permiso.'),
          });
      });
  }

  /** Recarga los permisos concedidos por el usuario. */
  private loadShares(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    this.sharesService
      .sharedByMe()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (shares) => this.shares.set(shares),
        error: (error: unknown) => {
          this.shares.set([]);
          this.showError(error, 'No se pudieron cargar los permisos concedidos.');
        },
      });
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 3500 });
  }

  /** Mensajes claros para 400/404 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    this.snackBar.open(apiErrorMessage(error, fallback), 'Cerrar', {
      duration: 6000,
    });
  }
}
