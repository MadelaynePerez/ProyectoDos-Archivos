import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** Datos configurable del diálogo de texto. */
export interface PromptDialogData {
  title: string;
  message?: string;
  label?: string;
  value?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
  maxLength?: number;
}

/**
 * Diálogo reutilizable para pedir un texto (renombrar, crear carpeta, etc.).
 * Devuelve el texto con `trim` o `null` si se cancela.
 */
@Component({
  selector: 'app-prompt-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './prompt-dialog.component.html',
  styleUrl: './prompt-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PromptDialogComponent {
  readonly data = inject<PromptDialogData>(MAT_DIALOG_DATA);

  private readonly dialogRef: MatDialogRef<
    PromptDialogComponent,
    string | null
  > = inject(MatDialogRef);

  /** Control único del diálogo, con las validaciones solicitadas. */
  readonly control = new FormControl(this.data.value ?? '', {
    nonNullable: true,
    validators: [
      ...(this.data.required === false ? [] : [Validators.required]),
      ...(this.data.maxLength
        ? [Validators.maxLength(this.data.maxLength)]
        : []),
    ],
  });

  /** Cierra con el texto limpio; si queda vacío y es obligatorio, no envía. */
  protected submit(): void {
    this.control.markAsTouched();
    if (this.control.invalid) {
      return;
    }
    const value = this.control.value.trim();
    if (this.data.required !== false && !value) {
      this.control.setErrors({ required: true });
      return;
    }
    this.dialogRef.close(value);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
