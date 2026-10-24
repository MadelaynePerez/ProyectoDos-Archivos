import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { MatInputModule } from '@angular/material/input';

/** Límite de contenido indicado por el contrato de la API (5 MB). */
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;

/** Datos de contexto: carpeta donde se creará el archivo. */
export interface SaveFileModalData {
  folderName: string;
}

/** Resultado del modal; el padre construye el Blob y llama a la API. */
export interface SaveFileModalResult {
  name: string;
  content: string;
}

/**
 * Valida el nombre sin exigir que el usuario escriba la extensión en un
 * formato exacto: se admite cualquier combinación de mayúsculas en `.txt` o
 * `.md`, pero el nombre debe tener algo antes del punto.
 */
function fileNameValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  return /^.+\.(txt|md)$/i.test(value) ? null : { fileName: true };
}

/**
 * Valida el tamaño en bytes dentro del propio control. Así Material marca el
 * campo como inválido y muestra el `mat-error`; un `@if` externo no basta.
 */
function contentSizeValidator(control: AbstractControl): ValidationErrors | null {
  const value = typeof control.value === 'string' ? control.value : '';
  return new Blob([value]).size > MAX_CONTENT_BYTES ? { contentTooLarge: true } : null;
}

/**
 * Modal "Nuevo archivo".
 *
 * Solo recoge el nombre y el texto; la subida real la hace el explorador para
 * poder refrescar la tabla y mostrar el mensaje con MatSnackBar. El contenido
 * se envía luego como Blob en `POST /api/files`.
 */
@Component({
  selector: 'app-save-file-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
  ],
  templateUrl: './save-file-modal.component.html',
  styleUrl: './save-file-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveFileModalComponent {
  readonly data = inject<SaveFileModalData>(MAT_DIALOG_DATA);

  private readonly dialogRef =
    inject<MatDialogRef<SaveFileModalComponent, SaveFileModalResult | null>>(MatDialogRef);

  /** Nombre visible, con extensión .txt o .md. */
  readonly name = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(255), fileNameValidator],
  });

  /** Contenido inicial del archivo; puede quedar vacío. */
  readonly content = new FormControl('', {
    nonNullable: true,
    validators: [contentSizeValidator],
  });

  /** Tamaño real en bytes del texto, para respetar el límite del backend. */
  private readonly contentBytes = signal(0);

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
    // El límite del backend es en bytes, no en caracteres: un texto con acentos
    // o emojis ocupa más de lo que sugiere su longitud.
    this.content.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      this.contentBytes.set(new Blob([value]).size);
    });
  }

  /** Devuelve el nombre normalizado y el texto; el padre arma el multipart. */
  protected submit(event: Event): void {
    event.preventDefault();
    this.name.markAsTouched();

    if (this.name.invalid || this.tooLarge()) {
      return;
    }

    // La extensión se guarda en minúsculas para que coincida con la API.
    const name = this.name.value
      .trim()
      .replace(/\.(txt|md)$/i, (extension) => extension.toLowerCase());

    this.dialogRef.close({ name, content: this.content.value });
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
