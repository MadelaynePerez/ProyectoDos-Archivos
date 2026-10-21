import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';

import type { User, UserRole } from '../../../../core/models/user.model';

/** Usuario que se está editando en el modal. */
export interface SaveUserModalData {
  user: User;
}

/** Opciones de rol disponibles, con una breve explicación. */
const ROLE_OPTIONS: readonly {
  value: UserRole;
  label: string;
  description: string;
}[] = [
  {
    value: 'USER',
    label: 'Usuario (USER)',
    description: 'Accede a sus propios archivos y a los recursos que otros compartan con él.',
  },
  {
    value: 'ADMIN',
    label: 'Administrador (ADMIN)',
    description: 'Además de lo anterior, puede administrar usuarios y consultar reportes globales.',
  },
];

/**
 * Modal para cambiar el rol de una cuenta.
 *
 * Solo devuelve el rol elegido; la llamada `PATCH /api/users/:id` la hace el
 * componente de la lista para poder refrescar la tabla y mostrar el resultado.
 */
@Component({
  selector: 'app-save-user-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './save-user-modal.component.html',
  styleUrl: './save-user-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveUserModalComponent {
  readonly data = inject<SaveUserModalData>(MAT_DIALOG_DATA);

  private readonly dialogRef = inject(MatDialogRef<SaveUserModalComponent, UserRole | null>);

  readonly options = ROLE_OPTIONS;

  readonly role = new FormControl<UserRole>(this.data.user.role, {
    nonNullable: true,
  });

  /** Cierra con el rol nuevo o con `null` si no hubo cambios o se cancela. */
  protected confirm(): void {
    if (this.role.value === this.data.user.role) {
      this.dialogRef.close(null);
      return;
    }

    this.dialogRef.close(this.role.value);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }

  /** Explicación del rol seleccionado para mostrar en el modal. */
  protected selectedDescription(): string {
    return this.options.find((option) => option.value === this.role.value)?.description ?? '';
  }
}
