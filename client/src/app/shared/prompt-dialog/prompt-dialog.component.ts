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
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>

    <form (ngSubmit)="submit()">
      <mat-dialog-content>
        @if (data.message) {
          <p class="dialog-message">{{ data.message }}</p>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ data.label ?? 'Texto' }}</mat-label>
          <input
            matInput
            cdkFocusInitial
            [formControl]="control"
            [placeholder]="data.placeholder ?? ''"
            [attr.maxlength]="data.maxLength ?? null"
          />
          @if (control.hasError('required')) {
            <mat-error>Este campo es obligatorio.</mat-error>
          }
          @if (control.hasError('maxlength')) {
            <mat-error>
              No puede superar {{ data.maxLength }} caracteres.
            </mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button type="button" (click)="cancel()">
          {{ data.cancelText ?? 'Cancelar' }}
        </button>
        <button mat-flat-button type="submit" [disabled]="control.invalid">
          {{ data.confirmText ?? 'Aceptar' }}
        </button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    .full-width {
      width: 100%;
    }

    .dialog-message {
      margin: 0 0 1rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
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
