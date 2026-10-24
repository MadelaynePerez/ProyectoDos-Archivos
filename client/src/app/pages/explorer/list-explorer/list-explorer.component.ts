import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  finalize,
  forkJoin,
  of,
  switchMap,
  tap,
} from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import type {
  FileExtension,
  FileItem,
  FileSortBy,
  SortOrder,
} from '../../../core/models/file.model';
import type { Folder } from '../../../core/models/folder.model';
import type { ShareResourceType } from '../../../core/models/share.model';
import { AuthService } from '../../../core/services/auth.service';
import { FilesService } from '../../../core/services/files.service';
import { FoldersService } from '../../../core/services/folders.service';
import { StorageService } from '../../../core/services/storage.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  EditContentModalComponent,
  type EditContentModalData,
} from '../../../shared/edit-content-modal/edit-content-modal.component';
import {
  DataTableComponent,
  type DataTableAction,
  type DataTableActionEvent,
  type DataTableColumn,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';
import {
  PromptDialogComponent,
  type PromptDialogData,
} from '../../../shared/prompt-dialog/prompt-dialog.component';
import {
  MoveDialogComponent,
  type MoveDialogData,
  type MoveDialogResult,
} from '../components/move-dialog/move-dialog.component';
import {
  SaveFileModalComponent,
  type SaveFileModalData,
  type SaveFileModalResult,
} from '../components/save-file-modal/save-file-modal.component';
import {
  ShareDialogComponent,
  type ShareDialogData,
} from '../components/share-dialog/share-dialog.component';

/** Límite de subida indicado por el contrato de la API. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const RENAME_ACTION: DataTableAction = {
  id: 'rename',
  label: 'Renombrar',
  icon: 'edit',
};
const EDIT_CONTENT_ACTION: DataTableAction = {
  id: 'edit-content',
  label: 'Editar contenido',
  icon: 'edit_note',
};
const DOWNLOAD_ACTION: DataTableAction = {
  id: 'download',
  label: 'Descargar',
  icon: 'download',
};
const MOVE_ACTION: DataTableAction = {
  id: 'move',
  label: 'Mover',
  icon: 'drive_file_move',
};
const DELETE_ACTION: DataTableAction = {
  id: 'delete',
  label: 'Mover a papelera',
  icon: 'delete',
  danger: true,
};
const SHARE_ACTION: DataTableAction = {
  id: 'share',
  label: 'Compartir',
  icon: 'share',
};

/** Las carpetas no se descargan; el resto de acciones aplica a ambos tipos. */
const FOLDER_ACTIONS: readonly DataTableAction[] = [
  RENAME_ACTION,
  MOVE_ACTION,
  SHARE_ACTION,
  DELETE_ACTION,
];
const FILE_ACTIONS: readonly DataTableAction[] = [
  RENAME_ACTION,
  EDIT_CONTENT_ACTION,
  DOWNLOAD_ACTION,
  MOVE_ACTION,
  SHARE_ACTION,
  DELETE_ACTION,
];

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

/** Fila unificada que consume la tabla compartida. */
interface ExplorerRow extends DataTableRow {
  _id: string;
  _kind: 'folder' | 'file';
  /** Solo los archivos propios (o con EDIT) admiten editar contenido. */
  _canEdit: boolean;
  name: string;
  typeLabel: string;
  size?: number;
  createdAt: string;
}

/**
 * Pantalla "Mis archivos".
 *
 * Combina carpetas y archivos en una sola tabla. Las carpetas se ordenan por
 * nombre desde la API y los archivos respetan búsqueda, extensión y orden
 * enviados como query params. La navegación se mantiene en un breadcrumb en
 * memoria, sin recargar la página.
 */
@Component({
  selector: 'app-list-explorer',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
  ],
  templateUrl: './list-explorer.component.html',
  styleUrl: './list-explorer.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListExplorerComponent {
  private readonly foldersService = inject(FoldersService);
  private readonly filesService = inject(FilesService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Contenido de la carpeta actual. */
  readonly folders = signal<readonly Folder[]>([]);
  readonly files = signal<readonly FileItem[]>([]);
  readonly loading = signal(false);
  readonly uploading = signal(false);

  /** `null` representa la raíz del usuario. */
  readonly currentFolderId = signal<string | null>(null);
  readonly breadcrumb = signal<readonly BreadcrumbItem[]>([{ id: null, name: 'Mis archivos' }]);

  /** Estado de los filtros; los archivos se consultan en el servidor. */
  readonly searchTerm = signal('');
  readonly extension = signal<'' | FileExtension>('');
  readonly sortBy = signal<FileSortBy>('name');
  readonly sortOrder = signal<SortOrder>('asc');

  /** Fuerza una recarga después de crear, renombrar, mover o eliminar. */
  private readonly reloadTrigger = signal(0);

  readonly columns: readonly DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'typeLabel', label: 'Tipo', format: 'badge' },
    { key: 'size', label: 'Tamaño', format: 'size' },
    { key: 'createdAt', label: 'Fecha', format: 'date' },
  ];

  /** La columna de acciones se muestra porque siempre hay acciones posibles. */
  readonly actions = FILE_ACTIONS;

  /**
   * Acciones según la fila: las carpetas no se descargan y "Editar contenido"
   * solo se ofrece en archivos propios o con permiso EDIT.
   */
  readonly actionsForRow = (row: DataTableRow): readonly DataTableAction[] => {
    if (row['_kind'] !== 'file') {
      return FOLDER_ACTIONS;
    }

    return row['_canEdit'] === true
      ? FILE_ACTIONS
      : FILE_ACTIONS.filter((action) => action.id !== EDIT_CONTENT_ACTION.id);
  };

  /** Solo las carpetas se abren con clic o Enter. */
  readonly isFolderRow = (row: DataTableRow): boolean => row['_kind'] === 'folder';

  /** El buscador también filtra las carpetas en cliente (la API no lo admite). */
  readonly visibleFolders = computed<readonly Folder[]>(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase();
    if (!term) {
      return this.folders();
    }

    return this.folders().filter((folder) => folder.name.toLocaleLowerCase().includes(term));
  });

  /** Filas finales: primero carpetas y luego archivos, como en un explorador. */
  readonly rows = computed<readonly ExplorerRow[]>(() => [
    ...this.visibleFolders().map((folder) => this.toFolderRow(folder)),
    ...this.files().map((file) => this.toFileRow(file)),
  ]);

  readonly emptyMessage = computed(() => {
    const hasFilters = this.searchTerm().trim().length > 0 || this.extension() !== '';
    return hasFilters
      ? 'No se encontraron archivos con los filtros aplicados.'
      : 'Esta carpeta está vacía.';
  });

  constructor() {
    /*
     * Cada cambio de carpeta o filtro genera una nueva consulta. `switchMap`
     * cancela la petición anterior si el usuario navega o escribe rápido.
     * La búsqueda se debounce para no llamar a la API en cada tecla.
     */
    combineLatest([
      toObservable(this.currentFolderId),
      toObservable(this.extension),
      toObservable(this.sortBy),
      toObservable(this.sortOrder),
      toObservable(this.searchTerm).pipe(debounceTime(300), distinctUntilChanged()),
      toObservable(this.reloadTrigger),
    ])
      .pipe(
        tap(() => this.loading.set(true)),
        switchMap(([folderId, extension, sortBy, sortOrder, search]) =>
          forkJoin({
            folders: this.foldersService.list(folderId),
            files: this.filesService.list({
              folderId,
              search,
              extension,
              sortBy,
              sortOrder,
            }),
          }).pipe(
            catchError((error: unknown) => {
              this.showError(error, 'No se pudo cargar el contenido de la carpeta.');
              return of({
                folders: [] as Folder[],
                files: [] as FileItem[],
              });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe(({ folders, files }) => {
        this.folders.set(folders);
        this.files.set(files);
        this.loading.set(false);
      });
  }

  /** Actualiza el término de búsqueda; la consulta sale con debounce. */
  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchTerm.set('');
  }

  setExtension(value: '' | FileExtension): void {
    this.extension.set(value);
  }

  setSortBy(value: FileSortBy): void {
    this.sortBy.set(value);
  }

  toggleSortOrder(): void {
    this.sortOrder.update((order) => (order === 'asc' ? 'desc' : 'asc'));
  }

  /** Abre una carpeta y agrega su nivel al breadcrumb. */
  openFolder(folder: Folder): void {
    this.breadcrumb.update((items) => [...items, { id: folder._id, name: folder.name }]);
    this.currentFolderId.set(folder._id);
  }

  /** Vuelve a un nivel anterior (o a la raíz) desde el breadcrumb. */
  goToBreadcrumb(index: number): void {
    const items = this.breadcrumb();

    // El último elemento es la carpeta actual: hacer clic no cambia nada.
    if (index < 0 || index >= items.length - 1) {
      return;
    }

    this.currentFolderId.set(items[index].id);
    this.breadcrumb.set(items.slice(0, index + 1));
  }

  /** Clic en una fila: solo las carpetas navegan. */
  onRowSelected(row: DataTableRow): void {
    if (row['_kind'] !== 'folder') {
      return;
    }

    const id = String(row['_id']);
    const folder = this.folders().find((item) => item._id === id);
    if (folder) {
      this.openFolder(folder);
    }
  }

  /** Despacha la acción elegida en el menú de la fila. */
  onAction(event: DataTableActionEvent): void {
    const id = String(event.row['_id']);
    const kind = event.row['_kind'];

    if (kind === 'folder') {
      const folder = this.folders().find((item) => item._id === id);
      if (!folder) {
        return;
      }

      switch (event.action) {
        case 'rename':
          this.renameFolder(folder);
          break;
        case 'move':
          this.openMoveDialog(folder, 'folder');
          break;
        case 'share':
          this.openShareDialog(folder, 'FOLDER');
          break;
        case 'delete':
          this.deleteFolder(folder);
          break;
      }
      return;
    }

    if (kind === 'file') {
      const file = this.files().find((item) => item._id === id);
      if (!file) {
        return;
      }

      switch (event.action) {
        case 'rename':
          this.renameFile(file);
          break;
        case 'edit-content':
          this.editFileContent(file);
          break;
        case 'download':
          this.downloadFile(file);
          break;
        case 'move':
          this.openMoveDialog(file, 'file');
          break;
        case 'share':
          this.openShareDialog(file, 'FILE');
          break;
        case 'delete':
          this.deleteFile(file);
          break;
      }
    }
  }

  /** Pide el nombre y crea la carpeta dentro de la ubicación actual. */
  createFolder(): void {
    this.dialog
      .open<PromptDialogComponent, PromptDialogData, string | null>(PromptDialogComponent, {
        data: {
          title: 'Nueva carpeta',
          message:
            'La carpeta se creará dentro de la ubicación actual. El nombre debe ser único entre sus hermanas.',
          label: 'Nombre de la carpeta',
          placeholder: 'Ej. Proyectos',
          confirmText: 'Crear',
          maxLength: 255,
        },
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((name) => {
        if (!name) {
          return;
        }

        this.foldersService.create(name, this.currentFolderId()).subscribe({
          next: (folder) => {
            this.notify(`Carpeta "${folder.name}" creada.`);
            this.reload();
          },
          error: (error: unknown) => this.showError(error, 'No se pudo crear la carpeta.'),
        });
      });
  }

  /**
   * Abre el modal "Nuevo archivo" y crea el archivo de texto en la carpeta
   * actual. El contenido se envía como Blob dentro del multipart.
   */
  createFile(): void {
    const items = this.breadcrumb();
    const folderName = items.length > 0 ? items[items.length - 1].name : 'Mis archivos';

    this.dialog
      .open<SaveFileModalComponent, SaveFileModalData, SaveFileModalResult | null>(
        SaveFileModalComponent,
        {
          data: { folderName },
          width: '44rem',
          maxWidth: '95vw',
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (result) {
          this.uploadNewFile(result);
        }
      });
  }

  /** Construye el Blob y sube el archivo con `POST /api/files`. */
  private uploadNewFile(result: SaveFileModalResult): void {
    const extension = result.name.slice(result.name.lastIndexOf('.') + 1).toLocaleLowerCase();
    const mimeType = extension === 'md' ? 'text/markdown' : 'text/plain';

    // `File` aporta el nombre visible; el contenido real es el Blob del texto.
    const blob = new Blob([result.content], { type: `${mimeType};charset=utf-8` });
    const file = new File([blob], result.name, { type: mimeType });

    if (file.size > MAX_UPLOAD_BYTES) {
      this.showMessage('El archivo no puede superar los 5 MB.');
      return;
    }

    this.uploading.set(true);
    this.filesService
      .upload(file, this.currentFolderId())
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (uploaded) => {
          this.notify(`Archivo "${uploaded.name}" creado.`);
          // El archivo nuevo ocupa cuota: se actualiza la barra del sidenav.
          this.storage.refresh();
          this.reload();
        },
        error: (error: unknown) => this.showUploadError(error, 'No se pudo crear el archivo.'),
      });
  }

  /** Sube el archivo seleccionado a la carpeta actual. */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Permite volver a elegir el mismo archivo si la primera subida falló.
    input.value = '';

    if (!file) {
      return;
    }

    const extension = file.name.split('.').pop()?.toLocaleLowerCase();
    if (extension !== 'txt' && extension !== 'md') {
      this.showMessage('Solo se permiten archivos .txt y .md.');
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      this.showMessage('El archivo no puede superar los 5 MB.');
      return;
    }

    this.uploading.set(true);
    this.filesService
      .upload(file, this.currentFolderId())
      .pipe(finalize(() => this.uploading.set(false)))
      .subscribe({
        next: (uploaded) => {
          this.notify(`Archivo "${uploaded.name}" subido.`);
          // Toda subida incrementa `storageUsed`: se refresca la cuota.
          this.storage.refresh();
          this.reload();
        },
        error: (error: unknown) => this.showUploadError(error, 'No se pudo subir el archivo.'),
      });
  }

  private renameFolder(folder: Folder): void {
    this.dialog
      .open<PromptDialogComponent, PromptDialogData, string | null>(PromptDialogComponent, {
        data: {
          title: 'Renombrar carpeta',
          label: 'Nuevo nombre',
          value: folder.name,
          confirmText: 'Renombrar',
          maxLength: 255,
        },
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((name) => {
        if (!name) {
          return;
        }

        this.foldersService.rename(folder._id, name).subscribe({
          next: (updated) => {
            this.notify(`Carpeta renombrada a "${updated.name}".`);
            this.reload();
          },
          error: (error: unknown) => this.showError(error, 'No se pudo renombrar la carpeta.'),
        });
      });
  }

  private renameFile(file: FileItem): void {
    // Se muestra el nombre sin extensión: el backend la conserva siempre.
    const baseName = file.name.slice(0, -(file.extension.length + 1));

    this.dialog
      .open<PromptDialogComponent, PromptDialogData, string | null>(PromptDialogComponent, {
        data: {
          title: 'Renombrar archivo',
          message: `Se conservará la extensión .${file.extension}.`,
          label: 'Nuevo nombre',
          value: baseName,
          confirmText: 'Renombrar',
          maxLength: 255,
        },
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((name) => {
        if (!name) {
          return;
        }

        this.filesService.rename(file._id, name).subscribe({
          next: (updated) => {
            this.notify(`Archivo renombrado a "${updated.name}".`);
            this.reload();
          },
          error: (error: unknown) => this.showError(error, 'No se pudo renombrar el archivo.'),
        });
      });
  }

  private deleteFolder(folder: Folder): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Mover carpeta a la papelera',
          message:
            `La carpeta "${folder.name}" y todo su contenido se moverán a la papelera. ` +
            'Podrás restaurarla más adelante.',
          confirmText: 'Mover a papelera',
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

        this.foldersService.remove(folder._id).subscribe({
          next: (result) => {
            this.notify(
              `"${result.name}" se movió a la papelera con ` +
                `${result.affectedFolders} carpeta(s) y ${result.affectedFiles} archivo(s).`,
            );
            this.reload();
          },
          error: (error: unknown) =>
            this.showError(error, 'No se pudo mover la carpeta a la papelera.'),
        });
      });
  }

  private deleteFile(file: FileItem): void {
    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Mover archivo a la papelera',
          message: `El archivo "${file.name}" se moverá a la papelera. Podrás restaurarlo más adelante.`,
          confirmText: 'Mover a papelera',
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

        this.filesService.remove(file._id).subscribe({
          next: () => {
            this.notify(`"${file.name}" se movió a la papelera.`);
            this.reload();
          },
          error: (error: unknown) =>
            this.showError(error, 'No se pudo mover el archivo a la papelera.'),
        });
      });
  }

  /** Descarga el binario y lo guarda con su nombre visible. */
  private downloadFile(file: FileItem): void {
    this.filesService.download(file._id).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();

        // Se libera el blob después de que el navegador inicie la descarga.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        this.notify(`Descarga de "${file.name}" iniciada.`);
      },
      error: (error: unknown) => this.showError(error, 'No se pudo descargar el archivo.'),
    });
  }

  /**
   * Carga el texto con la descarga y abre el editor. Solo se ofrece en
   * archivos propios (o con permiso EDIT), porque el backend exige EDIT.
   */
  private editFileContent(file: FileItem): void {
    this.filesService.download(file._id).subscribe({
      next: (blob) => {
        blob.text().then(
          (content) => this.openEditContentModal(file, content),
          () => this.showMessage('No se pudo leer el contenido del archivo.'),
        );
      },
      error: (error: unknown) =>
        this.showError(error, 'No se pudo cargar el contenido del archivo.'),
    });
  }

  /** Abre el modal con el texto actual y guarda solo si cambió. */
  private openEditContentModal(file: FileItem, content: string): void {
    this.dialog
      .open<EditContentModalComponent, EditContentModalData, string | null>(
        EditContentModalComponent,
        {
          data: { fileName: file.name, content },
          width: '48rem',
          maxWidth: '95vw',
        },
      )
      .afterClosed()
      .subscribe((updated) => {
        // `null`/`undefined` significan cancelar; el mismo texto no se reenvía.
        if (updated === null || updated === undefined || updated === content) {
          return;
        }

        this.saveFileContent(file, updated);
      });
  }

  /** Reemplaza el contenido con `PUT /api/files/:id/content`. */
  private saveFileContent(file: FileItem, content: string): void {
    const mimeType = file.extension === 'md' ? 'text/markdown' : 'text/plain';

    // La API recibe multipart; se conserva el nombre y la extensión actuales.
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const upload = new File([blob], file.name, { type: mimeType });

    if (upload.size > MAX_UPLOAD_BYTES) {
      this.showMessage('El contenido no puede superar los 5 MB.');
      return;
    }

    this.filesService.updateContent(file._id, upload).subscribe({
      next: (updated) => {
        this.notify(`Contenido de "${updated.name}" actualizado.`);
        // Reemplazar contenido ajusta `storageUsed` por la diferencia de tamaño.
        this.storage.refresh();
        this.reload();
      },
      error: (error: unknown) =>
        this.showUploadError(error, 'No se pudo guardar el contenido del archivo.'),
    });
  }

  /** Carga el árbol completo y abre el diálogo con los destinos válidos. */
  private openMoveDialog(item: Folder | FileItem, itemType: 'folder' | 'file'): void {
    this.foldersService.listAll().subscribe({
      next: (folders) => {
        const data: MoveDialogData = {
          itemId: item._id,
          itemName: item.name,
          itemType,
          currentParentId: this.currentFolderId(),
          folders,
        };

        this.dialog
          .open<MoveDialogComponent, MoveDialogData, MoveDialogResult>(MoveDialogComponent, {
            data,
            width: '30rem',
            maxWidth: '95vw',
          })
          .afterClosed()
          .subscribe((result) => {
            if (!result) {
              return;
            }

            if (itemType === 'folder') {
              this.foldersService.move(item._id, result.destinationId).subscribe({
                next: () => {
                  this.notify(`"${item.name}" se movió correctamente.`);
                  this.reload();
                },
                error: (error: unknown) => this.showError(error, 'No se pudo mover el elemento.'),
              });
              return;
            }

            this.filesService.move(item._id, result.destinationId).subscribe({
              next: () => {
                this.notify(`"${item.name}" se movió correctamente.`);
                this.reload();
              },
              error: (error: unknown) => this.showError(error, 'No se pudo mover el elemento.'),
            });
          });
      },
      error: (error: unknown) =>
        this.showError(error, 'No se pudieron cargar las carpetas de destino.'),
    });
  }

  private reload(): void {
    this.reloadTrigger.update((value) => value + 1);
  }

  /**
   * Abre el diálogo para compartir el recurso seleccionado.
   * Solo se ofrece en el explorador propio, donde el usuario es el propietario.
   */
  private openShareDialog(item: Folder | FileItem, resourceType: ShareResourceType): void {
    const data: ShareDialogData = {
      resourceType,
      resourceId: item._id,
      resourceName: item.name,
    };

    this.dialog.open<ShareDialogComponent, ShareDialogData, boolean>(ShareDialogComponent, {
      data,
      width: '34rem',
      maxWidth: '95vw',
    });
  }

  private toFolderRow(folder: Folder): ExplorerRow {
    return {
      _id: folder._id,
      _kind: 'folder',
      _canEdit: false,
      name: folder.name,
      typeLabel: 'Carpeta',
      createdAt: folder.createdAt,
    };
  }

  private toFileRow(file: FileItem): ExplorerRow {
    return {
      _id: file._id,
      _kind: 'file',
      _canEdit: this.canEditContent(file),
      name: file.name,
      typeLabel: 'Archivo',
      size: file.size,
      createdAt: file.createdAt,
    };
  }

  /**
   * En el explorador propio todos los archivos son del usuario. La
   * comprobación deja la puerta abierta a archivos recibidos con EDIT desde
   * otras vistas; el backend vuelve a validar el permiso en cada petición.
   */
  private canEditContent(file: FileItem): boolean {
    const user = this.auth.currentUser();
    return user !== null && file.ownerId === user._id;
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 3500 });
  }

  /** Mensaje informativo para validaciones hechas antes de llamar a la API. */
  private showMessage(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 5000 });
  }

  /**
   * Mensaje específico para el 413 de subida, creación y edición de contenido.
   *
   * El backend usa el mismo código cuando el archivo supera 5 MB o cuando no
   * cabe en la cuota. El límite de 5 MB ya se valida en el cliente, así que se
   * explica el caso de cuota y cómo liberar espacio.
   */
  private showUploadError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse && error.status === 413) {
      this.snackBar.open(
        'Espacio insuficiente: el archivo no cabe en tu cuota de almacenamiento. ' +
          'Vacía la papelera o pide al administrador que amplíe tu cuota.',
        'Cerrar',
        { duration: 8000 },
      );
      return;
    }

    this.showError(error, fallback);
  }

  /** Muestra el detalle del backend para 400, 404 y 409 (y otros errores). */
  private showError(error: unknown, fallback: string): void {
    this.snackBar.open(apiErrorMessage(error, fallback), 'Cerrar', {
      duration: 6000,
    });
  }
}
