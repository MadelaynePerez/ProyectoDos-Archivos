import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import type { UpdateUserRequest, User, UserRole } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth.service';
import { StorageService } from '../../../core/services/storage.service';
import { UsersService } from '../../../core/services/users.service';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableAction,
  type DataTableActionEvent,
  type DataTableColumn,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';
import {
  SaveUserModalComponent,
  type SaveUserModalData,
  type SaveUserModalResult,
} from '../components/save-user-modal/save-user-modal.component';

/** Acciones disponibles en el menú de cada usuario. */
const EDIT_USER_ACTION: DataTableAction = {
  id: 'edit-user',
  label: 'Editar rol y cuota',
  icon: 'manage_accounts',
};
const ACTIVATE_ACTION: DataTableAction = {
  id: 'activate',
  label: 'Activar cuenta',
  icon: 'check_circle',
};
const DEACTIVATE_ACTION: DataTableAction = {
  id: 'deactivate',
  label: 'Desactivar cuenta',
  icon: 'block',
  danger: true,
};

/** Fila de la tabla administrativa de usuarios. */
interface UserRow extends DataTableRow {
  _id: string;
  name: string;
  email: string;
  role: UserRole;
  status: string;
  /** Cuota total y espacio usado, ambos en bytes (los formatea la tabla). */
  storageQuota: number;
  storageUsed: number;
  createdAt: string;
  isActive: boolean;
}

/**
 * Panel ADMIN de usuarios.
 *
 * Lista todas las cuentas con su rol, estado, almacenamiento y fecha de alta.
 * Desde cada fila se puede activar/desactivar la cuenta o cambiar su rol con
 * `PATCH /api/users/:id`. La ruta ya está protegida por `adminGuard` y el
 * backend vuelve a validar el rol en cada petición.
 */
@Component({
  selector: 'app-list-users',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
  ],
  templateUrl: './list-users.component.html',
  styleUrl: './list-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListUsersComponent {
  private readonly usersService = inject(UsersService);
  private readonly storage = inject(StorageService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  readonly users = signal<readonly User[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);

  readonly columns: readonly DataTableColumn[] = [
    { key: 'name', label: 'Nombre' },
    { key: 'email', label: 'Correo' },
    { key: 'role', label: 'Rol', format: 'badge' },
    { key: 'status', label: 'Estado', format: 'badge' },
    { key: 'storageQuota', label: 'Cuota', format: 'size' },
    { key: 'storageUsed', label: 'Usado', format: 'size' },
    { key: 'createdAt', label: 'Fecha de alta', format: 'date' },
  ];

  /** La tabla muestra acciones porque siempre se puede editar rol y cuota. */
  readonly actions: readonly DataTableAction[] = [EDIT_USER_ACTION, DEACTIVATE_ACTION];

  /** Activar o desactivar según el estado actual de la fila. */
  readonly actionsForRow = (row: DataTableRow): readonly DataTableAction[] =>
    row['isActive'] === true
      ? [EDIT_USER_ACTION, DEACTIVATE_ACTION]
      : [EDIT_USER_ACTION, ACTIVATE_ACTION];

  /** Filas con etiquetas legibles para los badges de la tabla compartida. */
  readonly rows = computed<readonly UserRow[]>(() =>
    this.users().map((user) => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.isActive ? 'Activo' : 'Inactivo',
      storageQuota: user.storageQuota,
      storageUsed: user.storageUsed,
      createdAt: user.createdAt,
      isActive: user.isActive,
    })),
  );

  readonly subtitle = computed(() => {
    const users = this.users();
    if (users.length === 0) {
      return 'Activa o desactiva cuentas y administra sus roles.';
    }

    const active = users.filter((user) => user.isActive).length;
    return `${users.length} cuenta(s) registrada(s) · ${active} activa(s).`;
  });

  readonly emptyMessage = 'No hay usuarios registrados.';

  constructor() {
    this.loadUsers();
  }

  /** Botón "Actualizar": vuelve a consultar el listado. */
  reload(): void {
    this.loadUsers();
  }

  /** Despacha la acción elegida sobre la fila. */
  onAction(event: DataTableActionEvent): void {
    const user = this.users().find((item) => item._id === String(event.row['_id']));

    if (!user || this.busy()) {
      return;
    }

    switch (event.action) {
      case 'edit-user':
        this.openEditModal(user);
        break;
      case 'activate':
        this.updateUser(user, { isActive: true }, `Cuenta de ${user.name} activada.`);
        break;
      case 'deactivate':
        this.confirmDeactivate(user);
        break;
    }
  }

  /**
   * Abre el modal que permite cambiar el rol y la cuota (en MB).
   * Solo se envía el PATCH si alguno de los dos valores cambió.
   */
  private openEditModal(user: User): void {
    const data: SaveUserModalData = { user };

    this.dialog
      .open<SaveUserModalComponent, SaveUserModalData, SaveUserModalResult | null>(
        SaveUserModalComponent,
        {
          data,
          width: '30rem',
          maxWidth: '95vw',
        },
      )
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }

        const changes: UpdateUserRequest = {};
        if (result.role !== user.role) {
          changes.role = result.role;
        }
        if (result.storageQuota !== user.storageQuota) {
          changes.storageQuota = result.storageQuota;
        }

        if (changes.role === undefined && changes.storageQuota === undefined) {
          return;
        }

        this.updateUser(user, changes, this.editSuccessMessage(user, changes));
      });
  }

  /** Resume en el snackbar qué campos se modificaron. */
  private editSuccessMessage(user: User, changes: UpdateUserRequest): string {
    const details: string[] = [];
    if (changes.role !== undefined) {
      details.push(`rol ${this.roleLabel(changes.role)}`);
    }
    if (changes.storageQuota !== undefined) {
      details.push(`cuota ${this.formatMb(changes.storageQuota)}`);
    }

    return `Datos de ${user.name} actualizados (${details.join(' y ')}).`;
  }

  /** Desactivar siempre pide confirmación (no borra recursos ni historial). */
  private confirmDeactivate(user: User): void {
    const data: ConfirmDialogData = {
      title: 'Desactivar cuenta',
      message:
        `La cuenta de ${user.name} (${user.email}) no podrá iniciar sesión ` +
        'mientras esté desactivada. Sus archivos, comparticiones e historial ' +
        'se conservan y podrás reactivarla después.',
      confirmText: 'Desactivar',
      danger: true,
    };

    this.dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data,
        width: '26rem',
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.updateUser(user, { isActive: false }, `Cuenta de ${user.name} desactivada.`);
      });
  }

  /** Ejecuta el PATCH y refleja el usuario actualizado en la tabla. */
  private updateUser(user: User, changes: UpdateUserRequest, successMessage: string): void {
    this.busy.set(true);

    this.usersService
      .update(user._id, changes)
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (updated) => {
          this.users.update((users) =>
            users.map((item) => (item._id === updated._id ? updated : item)),
          );
          this.notify(successMessage);
          this.syncCurrentSession(updated);

          // Si el ADMIN cambió su propia cuota, la barra del sidenav debe
          // reflejar el nuevo límite sin esperar a la siguiente operación.
          if (changes.storageQuota !== undefined && this.auth.currentUser()?._id === updated._id) {
            this.storage.refresh();
          }
        },
        error: (error: unknown) => {
          this.showError(error, 'No se pudo actualizar el usuario.');
          // Un 404 significa que la lista quedó desactualizada.
          this.loadUsers(false);
        },
      });
  }

  /**
   * Si el ADMIN modificó su propia cuenta, sincroniza la sesión local.
   * Al desactivarse cierra sesión; al perder el rol ADMIN vuelve a Mis archivos.
   */
  private syncCurrentSession(updated: User): void {
    const current = this.auth.currentUser();
    if (!current || current._id !== updated._id) {
      return;
    }

    if (!updated.isActive) {
      this.auth.logout();
      return;
    }

    this.auth.updateCurrentUser(updated);

    if (updated.role !== 'ADMIN') {
      void this.router.navigateByUrl('/files');
    }
  }

  /** Carga el listado administrativo de usuarios. */
  private loadUsers(showLoader = true): void {
    if (showLoader) {
      this.loading.set(true);
    }

    this.usersService
      .list()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (users) => this.users.set(users),
        error: (error: unknown) => {
          this.users.set([]);
          this.showError(error, 'No se pudo cargar el listado de usuarios.');
        },
      });
  }

  /** Etiqueta legible del rol para los mensajes de éxito. */
  private roleLabel(role: UserRole): string {
    return role === 'ADMIN' ? 'Administrador' : 'Usuario';
  }

  /** Convierte bytes a MB con un decimal para los mensajes de éxito. */
  private formatMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private notify(message: string): void {
    this.snackBar.open(message, 'Cerrar', { duration: 3500 });
  }

  /** Mensajes claros para 400/404/409 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    const message = apiErrorMessage(error, fallback, {
      badRequest: 'El cambio no es válido. Recarga la lista e inténtalo de nuevo.',
      notFound: 'El usuario ya no existe. Actualiza la lista.',
      conflict: 'No se pudo aplicar el cambio porque la cuenta fue modificada. Actualiza la lista.',
    });

    this.snackBar.open(message, 'Cerrar', { duration: 6000 });
  }
}
