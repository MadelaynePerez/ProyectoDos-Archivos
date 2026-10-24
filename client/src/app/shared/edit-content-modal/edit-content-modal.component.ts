import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type AbstractControl,
  FormControl,
  ReactiveFormsModule,
  type ValidationErrors,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

/** Límite de contenido indicado por el contrato de la API (5 MB). */
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** Datos que recibe el editor: nombre visible y texto ya descargado. */
export interface EditContentModalData {
  fileName: string;
  content: string;
}

/**
 * Valida el tamaño en bytes dentro del control para que Material muestre el
 * `mat-error` y no solo deshabilite el botón.
 */
function contentSizeValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  return new Blob([value]).size > MAX_CONTENT_BYTES ? { contentTooLarge: true } : null;
}

/**
 * Modal "Editar contenido".
 *
 * El texto llega ya descargado por la pantalla que lo abre; este diálogo solo
 * permite modificarlo y devuelve el nuevo contenido. El guardado con
 * `PUT /api/files/:id/content` lo hace el componente padre.
 */
@Component({
  selector: 'app-edit-content-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
  ],
  templateUrl: './edit-content-modal.component.html',
  styleUrl: './edit-content-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditContentModalComponent {
  readonly data = inject<EditContentModalData>(MAT_DIALOG_DATA);

  private readonly dialogRef =
    inject<MatDialogRef<EditContentModalComponent, string | null>>(MatDialogRef);

  /** Texto editable del archivo. */
  readonly content = new FormControl(this.data.content, {
    nonNullable: true,
    validators: [contentSizeValidator],
  });

  /** Tamaño real en bytes del texto para no superar el máximo del backend. */
  private readonly contentBytes = signal(new Blob([this.data.content]).size);

  readonly tooLarge = computed(() => this.contentBytes() > MAX_CONTENT_BYTES);

  readonly sizeLabel = computed(() => {
    const bytes = this.contentBytes();

    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  });

  constructor() {
    // Igual que en la creación: se cuentan bytes UTF-8, no caracteres.
    this.content.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.contentBytes.set(new Blob([value]).size);
    });
  }

  /** Cierra con el texto editado; el padre decide si lo envía a la API. */
  protected save(event: Event): void {
    event.preventDefault();

    if (this.tooLarge()) {
      return;
    }

    this.dialogRef.close(this.content.value);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
