import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import { type ShareAccess, SHARE_ACCESS_LABELS } from '../../../../core/models/share.model';

/** Datos que se muestran al administrar un permiso ya concedido. */
export interface ChangeAccessDialogData {
  resourceName: string;
  granteeName: string;
  access: ShareAccess;
}

/** Opciones del selector, en orden creciente de permisos. */
const ACCESS_OPTIONS: readonly { value: ShareAccess; label: string }[] = [
  { value: 'READ', label: 'Lectura (READ)' },
  { value: 'COMMENT', label: 'Comentarios (COMMENT)' },
  { value: 'EDIT', label: 'Edición (EDIT)' },
];

/**
 * Diálogo para cambiar el nivel de un permiso existente.
 * Devuelve el nuevo nivel o `null` si se cancela.
 */
@Component({
  selector: 'app-change-access-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './change-access-dialog.component.html',
  styleUrl: './change-access-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeAccessDialogComponent {
  readonly data = inject<ChangeAccessDialogData>(MAT_DIALOG_DATA);

  private readonly dialogRef = inject(
    MatDialogRef<ChangeAccessDialogComponent, ShareAccess | null>,
  );

  readonly options = ACCESS_OPTIONS;
  readonly access = new FormControl<ShareAccess>(this.data.access, {
    nonNullable: true,
  });

  protected confirm(): void {
    this.dialogRef.close(this.access.value);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }

  /** Etiqueta legible del nivel actual, usada en el mensaje. */
  protected currentLabel(): string {
    return SHARE_ACCESS_LABELS[this.data.access];
  }
}
