import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

import type { Folder } from '../../../../core/models/folder.model';

/** Datos que recibe el diálogo para calcular los destinos válidos. */
export interface MoveDialogData {
  itemId: string;
  itemName: string;
  itemType: 'folder' | 'file';
  currentParentId: string | null;
  folders: readonly Folder[];
}

/** Resultado del diálogo; `destinationId: null` representa la raíz. */
export interface MoveDialogResult {
  destinationId: string | null;
}

/** Valor interno para la opción "raíz"; evita usar `null` dentro de mat-select. */
const ROOT_DESTINATION = '__root__';

interface DestinationOption {
  id: string;
  label: string;
}

/**
 * Diálogo para elegir la carpeta destino de un archivo o carpeta.
 *
 * Recibe el árbol ya cargado por la pantalla y filtra destinos inválidos:
 * la carpeta actual, la propia carpeta y todos sus descendientes.
 */
@Component({
  selector: 'app-move-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
  ],
  templateUrl: './move-dialog.component.html',
  styleUrl: './move-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveDialogComponent {
  readonly data = inject<MoveDialogData>(MAT_DIALOG_DATA);

  private readonly dialogRef = inject(
    MatDialogRef<MoveDialogComponent, MoveDialogResult>,
  );

  /** El usuario debe elegir una opción antes de confirmar. */
  readonly destination = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required],
  });

  /** Opciones visibles, ordenadas por su ruta completa. */
  readonly destinations = computed<readonly DestinationOption[]>(() => {
    const foldersById = new Map(
      this.data.folders.map((folder) => [folder._id, folder]),
    );

    const options = this.data.folders
      .filter((folder) => this.isAllowedDestination(folder))
      .map<DestinationOption>((folder) => ({
        id: folder._id,
        label: this.pathFor(folder, foldersById),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));

    // La raíz solo se ofrece si el elemento no está ya en ella.
    return this.data.currentParentId === null
      ? options
      : [{ id: ROOT_DESTINATION, label: 'Raíz (Mis archivos)' }, ...options];
  });

  protected confirm(): void {
    this.destination.markAsTouched();
    if (this.destination.invalid) {
      return;
    }

    const selected = this.destination.value;
    this.dialogRef.close({
      destinationId: selected === ROOT_DESTINATION ? null : selected,
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  /** Excluye la ubicación actual, la propia carpeta y sus descendientes. */
  private isAllowedDestination(folder: Folder): boolean {
    if (folder._id === this.data.currentParentId) {
      return false;
    }

    if (this.data.itemType === 'folder') {
      if (folder._id === this.data.itemId) {
        return false;
      }
      return !folder.ancestors.includes(this.data.itemId);
    }

    return true;
  }

  /** Ruta legible ("Proyectos / 2026") usando los ancestros de la carpeta. */
  private pathFor(
    folder: Folder,
    foldersById: ReadonlyMap<string, Folder>,
  ): string {
    const ancestorNames = folder.ancestors.map(
      (id) => foldersById.get(id)?.name ?? '…',
    );
    return [...ancestorNames, folder.name].join(' / ');
  }
}
