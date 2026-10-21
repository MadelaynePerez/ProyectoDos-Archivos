import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../../core/api/api-error';
import {
  SHARE_ACCESS_LABELS,
  type ShareAccess,
  type ShareListItem,
  type ShareResourceType,
} from '../../../../core/models/share.model';
import { SharesService } from '../../../../core/services/shares.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../../shared/confirm-dialog/confirm-dialog.component';

/** Datos del recurso que se está compartiendo. */
export interface ShareDialogData {
  resourceType: ShareResourceType;
  resourceId: string;
  resourceName: string;
}

/** Opciones del selector de nivel, en orden creciente de permisos. */
const ACCESS_OPTIONS: readonly { value: ShareAccess; label: string }[] = [
  { value: 'READ', label: 'Lectura (READ)' },
  { value: 'COMMENT', label: 'Comentarios (COMMENT)' },
  { value: 'EDIT', label: 'Edición (EDIT)' },
];

/**
 * Diálogo para compartir un archivo o carpeta propia.
 *
 * Permite conceder un permiso por email y administrar los permisos actuales
 * del recurso: cambiar el nivel (PATCH) o retirarlo (DELETE). El listado se
 * obtiene de "compartido por mí" y se filtra por recurso porque el contrato no
 * expone un GET específico por recurso.
 */
@Component({
  selector: 'app-share-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './share-dialog.component.html',
  styleUrl: './share-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShareDialogComponent {
  readonly data = inject<ShareDialogData>(MAT_DIALOG_DATA);

  private readonly sharesService = inject(SharesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialogRef = inject(MatDialogRef<ShareDialogComponent, boolean>);

  readonly accessOptions = ACCESS_OPTIONS;

  /** Email del nuevo destinatario. */
  readonly email = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.email],
  });

  /** Nivel que se concederá al enviar el formulario. */
  readonly access = new FormControl<ShareAccess>('READ', {
    nonNullable: true,
  });

  /** Permisos actuales del recurso. */
  readonly currentShares = signal<readonly ShareListItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly busyShareId = signal<string | null>(null);

  /** Indica al padre si hubo cambios para que recargue sus listados. */
  private changed = false;

  constructor() {
    this.loadCurrentShares();
  }

  /** Concede el permiso indicado o actualiza el existente. */
  protected grant(): void {
    this.email.markAsTouched();
    if (this.email.invalid || this.saving()) {
      return;
    }

    this.saving.set(true);
    this.sharesService
      .create({
        resourceType: this.data.resourceType,
        resourceId: this.data.resourceId,
        granteeEmail: this.email.value.trim(),
        access: this.access.value,
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.changed = true;
          this.email.reset('');
          this.notify(
            `Permiso de ${SHARE_ACCESS_LABELS[this.access.value]} concedido correctamente.`,
          );
          // Se recarga para obtener el nombre actual del destinatario.
          this.loadCurrentShares();
        },
        error: (error: unknown) => this.showError(error, 'No se pudo compartir el recurso.'),
      });
  }

  /** Cambia el nivel de un permiso existente mediante PATCH. */
  protected changeAccess(share: ShareListItem, access: ShareAccess): void {
    if (share.access === access || this.busyShareId()) {
      return;
    }

    this.busyShareId.set(share._id);
    this.sharesService
      .update(share._id, access)
      .pipe(finalize(() => this.busyShareId.set(null)))
      .subscribe({
        next: (updated) => {
          this.changed = true;
          this.currentShares.update((shares) =>
            shares.map((item) =>
              item._id === share._id ? { ...item, access: updated.access } : item,
            ),
          );
          this.notify(`Permiso actualizado a ${SHARE_ACCESS_LABELS[updated.access]}.`);
        },
        error: (error: unknown) => {
          this.showError(error, 'No se pudo cambiar el permiso.');
          // Si el cambio falló, se recarga para restaurar el valor real.
          this.loadCurrentShares(false);
        },
      });
  }

  /** Pide confirmación y retira el permiso mediante DELETE. */
  protected revoke(share: ShareListItem): void {
    if (this.busyShareId()) {
      return;
    }

    const grantee = share.grantee?.name ?? share.grantee?.email ?? 'El usuario';
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Retirar permiso',
          message:
            `${grantee} dejará de tener acceso a "${this.data.resourceName}". ` +
            'Los permisos heredados de esta compartición dejarán de aplicar.',
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

        this.busyShareId.set(share._id);
        this.sharesService
          .revoke(share._id)
          .pipe(finalize(() => this.busyShareId.set(null)))
          .subscribe({
            next: () => {
              this.changed = true;
              this.currentShares.update((shares) =>
                shares.filter((item) => item._id !== share._id),
              );
              this.notify(`Permiso de ${grantee} retirado.`);
            },
            error: (error: unknown) => this.showError(error, 'No se pudo retirar el permiso.'),
          });
      });
  }

  protected close(): void {
    this.dialogRef.close(this.changed);
  }

  /** Carga los permisos actuales del recurso desde "compartido por mí". */
  private loadCurrentShares(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    this.sharesService
      .listForResource(this.data.resourceType, this.data.resourceId)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (shares) => this.currentShares.set(shares),
        error: (error: unknown) =>
          this.showError(error, 'No se pudieron cargar los permisos actuales.'),
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
