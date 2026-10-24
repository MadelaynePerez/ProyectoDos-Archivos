import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import type { FileItem } from '../../../core/models/file.model';
import type { Folder } from '../../../core/models/folder.model';
import {
  highestShareAccess,
  type ShareAccess,
  type ShareListItem,
  type ShareResourceType,
  type ShareUser,
} from '../../../core/models/share.model';
import { FilesService } from '../../../core/services/files.service';
import { FoldersService } from '../../../core/services/folders.service';
import { SharesService } from '../../../core/services/shares.service';
import {
  DataTableComponent,
  type DataTableAction,
  type DataTableActionEvent,
  type DataTableColumn,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';
import {
  EditContentModalComponent,
  type EditContentModalData,
} from '../../../shared/edit-content-modal/edit-content-modal.component';
import {
  PromptDialogComponent,
  type PromptDialogData,
} from '../../../shared/prompt-dialog/prompt-dialog.component';

/** Acciones permitidas a un invitado: nunca mover, eliminar ni compartir. */
const DOWNLOAD_ACTION: DataTableAction = {
  id: 'download',
  label: 'Descargar',
  icon: 'download',
};
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
const SHARED_ACTIONS: readonly DataTableAction[] = [
  DOWNLOAD_ACTION,
  EDIT_CONTENT_ACTION,
  RENAME_ACTION,
];

/** Nivel de la carpeta compartida que se está explorando. */
interface BreadcrumbItem {
  id: string;
  name: string;
  access: ShareAccess;
}

/** Fila unificada de recursos directos o del contenido de una carpeta. */
interface SharedRow extends DataTableRow {
  _id: string;
  _kind: 'folder' | 'file';
  _shareId: string;
  name: string;
  resourceTypeLabel: string;
  access: ShareAccess;
  user: string;
  userEmail: string;
  createdAt: string;
}

/**
 * Pantalla "Compartido conmigo".
 *
 * En la raíz muestra las comparticiones directas. Al abrir una carpeta se
 * navega su contenido con la misma tabla: los hijos heredan el permiso de la
 * carpeta (o uno mayor si tienen un share directo). READ+ permite abrir
 * carpetas y descargar archivos; EDIT habilita renombrar. Las operaciones
 * estructurales del propietario (mover, eliminar, compartir) no se ofrecen.
 */
@Component({
  selector: 'app-list-shared-with-me',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
  ],
  templateUrl: './list-shared-with-me.component.html',
  styleUrl: './list-shared-with-me.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSharedWithMeComponent {
  private readonly sharesService = inject(SharesService);
  private readonly foldersService = inject(FoldersService);
  private readonly filesService = inject(FilesService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Comparticiones directas recibidas por el usuario. */
  readonly shares = signal<readonly ShareListItem[]>([]);

  /** Contenido de la carpeta compartida actual. */
  readonly folders = signal<readonly Folder[]>([]);
  readonly files = signal<readonly FileItem[]>([]);

  readonly loading = signal(false);

  /** `null` representa la lista raíz de comparticiones directas. */
  readonly currentFolderId = signal<string | null>(null);
  readonly currentAccess = signal<ShareAccess | null>(null);
  readonly currentOwner = signal<ShareUser | null>(null);
  readonly breadcrumb = signal<readonly BreadcrumbItem[]>([]);

  readonly columns: readonly DataTableColumn[] = [
    { key: 'name', label: 'Recurso' },
    { key: 'resourceTypeLabel', label: 'Tipo', format: 'badge' },
    { key: 'access', label: 'Permiso', format: 'badge' },
    { key: 'user', label: 'Usuario' },
    { key: 'createdAt', label: 'Fecha', format: 'date' },
  ];

  readonly actions = SHARED_ACTIONS;

  /** Descargar solo para archivos; editar contenido y renombrar solo con EDIT. */
  readonly actionsForRow = (row: DataTableRow): readonly DataTableAction[] => {
    const actions: DataTableAction[] = [];

    if (row['_kind'] === 'file') {
      actions.push(DOWNLOAD_ACTION);
    }
    if (row['access'] === 'EDIT') {
      if (row['_kind'] === 'file') {
        actions.push(EDIT_CONTENT_ACTION);
      }
      actions.push(RENAME_ACTION);
    }

    return actions;
  };

  readonly isFolderRow = (row: DataTableRow): boolean => row['_kind'] === 'folder';

  /** Índice de shares directos por recurso para calcular el permiso máximo. */
  private readonly directShares = computed<ReadonlyMap<string, ShareListItem>>(() => {
    const map = new Map<string, ShareListItem>();
    for (const share of this.shares()) {
      map.set(`${share.resourceType}:${share.resourceId}`, share);
    }
    return map;
  });

  /** Filas de la raíz o del contenido de la carpeta compartida actual. */
  readonly rows = computed<readonly SharedRow[]>(() => {
    if (this.currentFolderId() === null) {
      return this.shares().map((share) => this.toShareRow(share));
    }

    return [
      ...this.folders().map((folder) => this.toFolderRow(folder)),
      ...this.files().map((file) => this.toFileRow(file)),
    ];
  });

  readonly emptyMessage = computed(() => {
    if (this.currentFolderId() === null) {
      return 'Nadie ha compartido archivos o carpetas contigo todavía.';
    }
    return 'Esta carpeta compartida está vacía.';
  });

  constructor() {
    this.loadShares();
  }

  /** Abre una carpeta compartida con clic o Enter en su fila. */
  onRowSelected(row: DataTableRow): void {
    if (row['_kind'] !== 'folder') {
      return;
    }

    const id = String(row['_id']);
    const name = String(row['name']);
    const access = row['access'] as ShareAccess;

    // Al entrar desde la raíz se recuerda el propietario del recurso.
    if (this.currentFolderId() === null) {
      const share = this.shares().find((item) => item._id === String(row['_shareId']));
      this.currentOwner.set(share?.owner ?? null);
    }

    this.enterFolder(id, name, access);
  }

  /** Despacha descargar o renombrar según el recurso y su permiso. */
  onAction(event: DataTableActionEvent): void {
    const id = String(event.row['_id']);
    const name = String(event.row['name']);

    if (event.action === 'download' && event.row['_kind'] === 'file') {
      this.downloadFile(id, name);
      return;
    }

    if (event.action === 'edit-content' && event.row['_kind'] === 'file') {
      this.editFileContent(event.row);
      return;
    }

    if (event.action !== 'rename') {
      return;
    }

    // En la raíz el recurso viene de un share; dentro, del listado de la API.
    if (this.currentFolderId() === null) {
      const share = this.shares().find((item) => item._id === String(event.row['_shareId']));
      if (!share) {
        return;
      }
      if (share.resourceType === 'FOLDER') {
        this.renameFolder(share.resourceId, share.resourceName);
      } else {
        this.renameFile(share.resourceId, share.resourceName);
      }
      return;
    }

    if (event.row['_kind'] === 'folder') {
      this.renameFolder(id, name);
    } else {
      this.renameFile(id, name);
    }
  }

  /** Vuelve a la lista raíz de comparticiones directas. */
  goToRoot(): void {
    this.currentFolderId.set(null);
    this.currentAccess.set(null);
    this.currentOwner.set(null);
    this.breadcrumb.set([]);
    this.folders.set([]);
    this.files.set([]);
    this.loadShares();
  }

  /** Navega a un nivel anterior del breadcrumb. */
  goToBreadcrumb(index: number): void {
    const items = this.breadcrumb();
    if (!this.currentFolderId() || index >= items.length - 1) {
      return;
    }
    if (index < 0) {
      this.goToRoot();
      return;
    }

    const target = items[index];
    this.breadcrumb.set(items.slice(0, index + 1));
    this.currentFolderId.set(target.id);
    this.currentAccess.set(target.access);
    this.loadFolder(target.id, target.access);
  }

  /** Agrega el nivel al breadcrumb y carga su contenido. */
  private enterFolder(id: string, name: string, access: ShareAccess): void {
    this.breadcrumb.update((items) => [...items, { id, name, access }]);
    this.currentFolderId.set(id);
    this.currentAccess.set(access);
    this.loadFolder(id, access);
  }

  /** Carga las comparticiones directas del usuario. */
  private loadShares(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    this.sharesService
      .sharedWithMe()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (shares) => this.shares.set(shares),
        error: (error: unknown) => {
          this.shares.set([]);
          this.showError(error, 'No se pudieron cargar los recursos compartidos contigo.');
        },
      });
  }

  /** Lista carpetas y archivos de una carpeta compartida. */
  private loadFolder(folderId: string, access: ShareAccess): void {
    this.loading.set(true);

    forkJoin({
      folders: this.foldersService.list(folderId),
      files: this.filesService.list({ folderId }),
    })
      .pipe(
        catchError((error: unknown) => {
          this.showError(
            error,
            'No se pudo abrir la carpeta compartida. Verifica que aún tengas acceso.',
          );
          return of({ folders: [] as Folder[], files: [] as FileItem[] });
        }),
        finalize(() => this.loading.set(false)),
      )
      .subscribe(({ folders, files }) => {
        this.folders.set(folders);
        this.files.set(files);
      });
  }

  /** Descarga un archivo compartido (requiere READ+). */
  private downloadFile(fileId: string, name: string): void {
    this.filesService.download(fileId).subscribe({
      next: (blob) => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = name;
        document.body.append(link);
        link.click();
        link.remove();

        // Se libera el blob después de que el navegador inicie la descarga.
        setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        this.notify(`Descarga de "${name}" iniciada.`);
      },
      error: (error: unknown) => this.showError(error, 'No se pudo descargar el archivo.'),
    });
  }

  /**
   * Carga el texto con la descarga y abre el editor. Solo se ofrece con
   * permiso EDIT, que es el que exige `PUT /api/files/:id/content`.
   */
  private editFileContent(row: DataTableRow): void {
    if (this.currentFolderId() === null) {
      const share = this.shares().find((item) => item._id === String(row['_shareId']));
      if (!share || share.resourceType !== 'FILE') {
        return;
      }
      this.downloadAndEditContent(share.resourceId, share.resourceName);
      return;
    }

    this.downloadAndEditContent(String(row['_id']), String(row['name']));
  }

  private downloadAndEditContent(fileId: string, fileName: string): void {
    this.filesService.download(fileId).subscribe({
      next: (blob) => {
        blob.text().then(
          (content) => this.openEditContentModal(fileId, fileName, content),
          () => this.showMessage('No se pudo leer el contenido del archivo.'),
        );
      },
      error: (error: unknown) =>
        this.showError(error, 'No se pudo cargar el contenido del archivo.'),
    });
  }

  /** Abre el editor y guarda solo si el texto cambió. */
  private openEditContentModal(fileId: string, fileName: string, content: string): void {
    this.dialog
      .open<EditContentModalComponent, EditContentModalData, string | null>(
        EditContentModalComponent,
        {
          data: { fileName, content },
          width: '48rem',
          maxWidth: '95vw',
        },
      )
      .afterClosed()
      .subscribe((updated) => {
        if (updated === null || updated === undefined || updated === content) {
          return;
        }

        this.saveContent(fileId, fileName, updated);
      });
  }

  /** Reemplaza el contenido conservando el nombre y la extensión actuales. */
  private saveContent(fileId: string, fileName: string, content: string): void {
    const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLocaleLowerCase();
    const mimeType = extension === 'md' ? 'text/markdown' : 'text/plain';
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const file = new File([blob], fileName, { type: mimeType });

    this.filesService.updateContent(fileId, file).subscribe({
      next: (updated) => {
        this.notify(`Contenido de "${updated.name}" actualizado.`);
        this.reloadCurrentView();
      },
      error: (error: unknown) =>
        this.showError(error, 'No se pudo guardar el contenido del archivo.'),
    });
  }

  /** Renombra una carpeta; el backend exige EDIT. */
  private renameFolder(folderId: string, currentName: string): void {
    this.dialog
      .open<PromptDialogComponent, PromptDialogData, string | null>(PromptDialogComponent, {
        data: {
          title: 'Renombrar carpeta',
          message: 'Solo puedes renombrar si tienes permiso de edición.',
          label: 'Nuevo nombre',
          value: currentName,
          confirmText: 'Renombrar',
          maxLength: 255,
        },
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((name) => {
        if (!name || name === currentName) {
          return;
        }

        this.foldersService.rename(folderId, name).subscribe({
          next: (updated) => {
            this.notify(`Carpeta renombrada a "${updated.name}".`);
            this.reloadCurrentView();
          },
          error: (error: unknown) => this.showError(error, 'No se pudo renombrar la carpeta.'),
        });
      });
  }

  /** Renombra un archivo conservando su extensión. */
  private renameFile(fileId: string, currentName: string): void {
    this.dialog
      .open<PromptDialogComponent, PromptDialogData, string | null>(PromptDialogComponent, {
        data: {
          title: 'Renombrar archivo',
          message: 'Se conservará la extensión actual del archivo.',
          label: 'Nuevo nombre',
          value: this.fileBaseName(currentName),
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

        this.filesService.rename(fileId, name).subscribe({
          next: (updated) => {
            this.notify(`Archivo renombrado a "${updated.name}".`);
            this.reloadCurrentView();
          },
          error: (error: unknown) => this.showError(error, 'No se pudo renombrar el archivo.'),
        });
      });
  }

  /** Recarga la vista actual después de renombrar. */
  private reloadCurrentView(): void {
    const folderId = this.currentFolderId();
    if (folderId) {
      this.loadFolder(folderId, this.currentAccess() ?? 'READ');
    } else {
      this.loadShares(false);
    }
  }

  /** Nombre sin extensión para el diálogo de renombrado. */
  private fileBaseName(name: string): string {
    const dot = name.lastIndexOf('.');
    return dot > 0 ? name.slice(0, dot) : name;
  }

  /** Convierte un share directo en fila de la tabla raíz. */
  private toShareRow(share: ShareListItem): SharedRow {
    return {
      _id: share.resourceId,
      _kind: share.resourceType === 'FOLDER' ? 'folder' : 'file',
      _shareId: share._id,
      name: share.resourceName,
      resourceTypeLabel: share.resourceType === 'FOLDER' ? 'Carpeta' : 'Archivo',
      access: share.access,
      user: share.owner?.name ?? share.owner?.email ?? 'Usuario eliminado',
      userEmail: share.owner?.email ?? '',
      createdAt: share.createdAt,
    };
  }

  /** Fila de una subcarpeta con el máximo entre herencia y share directo. */
  private toFolderRow(folder: Folder): SharedRow {
    return this.toChildRow(folder, 'FOLDER', 'folder');
  }

  /** Fila de un archivo con el máximo entre herencia y share directo. */
  private toFileRow(file: FileItem): SharedRow {
    return this.toChildRow(file, 'FILE', 'file');
  }

  private toChildRow(
    resource: Folder | FileItem,
    resourceType: ShareResourceType,
    kind: 'folder' | 'file',
  ): SharedRow {
    const inherited = this.currentAccess() ?? 'READ';
    const direct = this.directShares().get(`${resourceType}:${resource._id}`);
    const access = highestShareAccess(inherited, direct?.access);

    return {
      _id: resource._id,
      _kind: kind,
      _shareId: direct?._id ?? '',
      name: resource.name,
      resourceTypeLabel: kind === 'folder' ? 'Carpeta' : 'Archivo',
      access,
      user: this.currentOwner()?.name ?? this.currentOwner()?.email ?? 'Propietario',
      userEmail: this.currentOwner()?.email ?? '',
      createdAt: resource.createdAt,
    };
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 3500 });
  }

  /** Mensaje informativo para fallos de lectura detectados en el cliente. */
  private showMessage(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 5000 });
  }

  /** Mensajes claros para 400/404 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    this.snackBar.open(apiErrorMessage(error, fallback), 'Cerrar', {
      duration: 6000,
    });
  }
}
