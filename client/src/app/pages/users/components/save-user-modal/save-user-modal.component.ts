import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  type AbstractControl,
  FormControl,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import type { User, UserRole } from '../../../../core/models/user.model';

/** Un MB en bytes: la API trabaja siempre en bytes enteros. */
const BYTES_PER_MB = 1024 * 1024;

/** Usuario que se está editando en el modal. */
export interface SaveUserModalData {
  user: User;
}

/** Resultado del modal: rol elegido y cuota ya convertida a bytes. */
export interface SaveUserModalResult {
  role: UserRole;
  storageQuota: number;
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
 * Valida la cuota en MB: debe ser positiva y, una vez convertida a bytes, no
 * puede quedar por debajo del espacio que el usuario ya tiene ocupado.
 */
function quotaValidator(minBytes: number) {
  return (control: AbstractControl): ValidationErrors | null => {
    const megabytes = Number(control.value);

    if (!Number.isFinite(megabytes) || megabytes <= 0) {
      return { quotaInvalid: true };
    }

    // La API exige un entero de bytes; se redondea para evitar decimales.
    const bytes = Math.round(megabytes * BYTES_PER_MB);
    return bytes < minBytes ? { quotaTooLow: true } : null;
  };
}

/**
 * Modal para editar la cuenta desde el panel ADMIN.
 *
 * Permite cambiar el rol y la cuota de almacenamiento (el ADMIN la escribe en
 * MB y aquí se convierte a bytes). Solo devuelve los valores elegidos; la
 * llamada `PATCH /api/users/:id` la hace la lista para refrescar la tabla y
 * mostrar el resultado con MatSnackBar.
 */
@Component({
  selector: 'app-save-user-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
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

  private readonly dialogRef = inject(
    MatDialogRef<SaveUserModalComponent, SaveUserModalResult | null>,
  );

  readonly options = ROLE_OPTIONS;

  readonly role = new FormControl<UserRole>(this.data.user.role, {
    nonNullable: true,
  });

  /**
   * Cuota expresada en MB para que sea fácil de editar. Se muestra redondeada
   * a dos decimales y se vuelve a convertir a bytes al guardar.
   */
  readonly quotaMb = new FormControl<number | null>(
    this.bytesToMegabytes(this.data.user.storageQuota),
    {
      validators: [Validators.required, quotaValidator(this.data.user.storageUsed)],
    },
  );

  /** Cierra con el rol y la cuota nuevos, o con `null` si no hay cambios. */
  protected confirm(): void {
    this.quotaMb.markAsTouched();

    if (this.role.invalid || this.quotaMb.invalid) {
      return;
    }

    if (!this.hasChanges()) {
      this.dialogRef.close(null);
      return;
    }

    this.dialogRef.close({
      role: this.role.value,
      storageQuota: this.quotaBytes(),
    });
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }

  /** Explicación del rol seleccionado para mostrar en el modal. */
  protected selectedDescription(): string {
    return this.options.find((option) => option.value === this.role.value)?.description ?? '';
  }

  /** Espacio usado actualmente, en MB, para el aviso de cuota mínima. */
  protected usedMb(): number {
    return this.bytesToMegabytes(this.data.user.storageUsed);
  }

  /** Habilita "Guardar" solo si el rol o la cuota realmente cambiaron. */
  protected hasChanges(): boolean {
    return (
      this.role.value !== this.data.user.role || this.quotaBytes() !== this.data.user.storageQuota
    );
  }

  /** Convierte la cuota escrita en MB a bytes enteros para la API. */
  private quotaBytes(): number {
    return Math.round((Number(this.quotaMb.value) || 0) * BYTES_PER_MB);
  }

  /** Bytes a MB con dos decimales, suficiente para cuotas y consumos reales. */
  private bytesToMegabytes(bytes: number): number {
    return Math.round((bytes / BYTES_PER_MB) * 100) / 100;
  }
}
