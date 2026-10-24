import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';

/** Formatos soportados por las celdas de la tabla. */
export type DataTableFormat = 'text' | 'date' | 'size' | 'badge';

/** Definición de una columna: clave en la fila, etiqueta y formato. */
export interface DataTableColumn {
  key: string;
  label: string;
  format?: DataTableFormat;
}

/** Acción disponible en el menú de cada fila. */
export interface DataTableAction {
  id: string;
  label: string;
  icon?: string;
  danger?: boolean;
}

/** Fila genérica: cualquier documento de la API representado como objeto. */
export type DataTableRow = Record<string, unknown>;

/** Evento emitido cuando el usuario elige una acción de una fila. */
export interface DataTableActionEvent {
  action: string;
  row: DataTableRow;
}

/**
 * Tabla reutilizable de toda la aplicación (archivos, carpetas, compartidos,
 * papelera, actividad, usuarios y reportes).
 *
 * Recibe las columnas y las filas, formatea los valores según el tipo y emite
 * `actionSelected` al padre. No conoce ningún dominio: nunca se debe crear
 * otra tabla por pantalla.
 */
@Component({
  selector: 'app-data-table',
  imports: [MatTableModule, MatPaginatorModule, MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataTableComponent {
  /** Columnas visibles, en orden. */
  readonly columns = input.required<readonly DataTableColumn[]>();

  /** Filas a mostrar. */
  readonly rows = input<readonly DataTableRow[]>([]);

  /** Acciones por fila; si está vacío no se muestra la columna de acciones. */
  readonly actions = input<readonly DataTableAction[]>([]);

  /** Permite devolver un subconjunto de acciones según la fila. */
  readonly actionsForRow = input<((row: DataTableRow) => readonly DataTableAction[]) | null>(null);

  /** Indica qué filas se pueden abrir con clic o con Enter. */
  readonly rowClickable = input<(row: DataTableRow) => boolean>(() => false);

  /** Encabezado de la columna de acciones. */
  readonly actionsLabel = input('Acciones');

  /** Texto cuando no hay filas. */
  readonly emptyMessage = input('No hay datos para mostrar.');

  /**
   * Paginación Material.
   *
   * En modo local (por defecto) la tabla pagina las filas recibidas. En modo
   * servidor la pantalla ya entrega solo la página actual y la tabla se limita
   * a mostrar el paginador con el total informado por la API.
   */
  readonly pageSize = input(10);
  readonly pageSizeOptions = input<readonly number[]>([5, 10, 25, 50]);

  /** Activa la paginación controlada por el servidor (`page`/`limit`). */
  readonly serverSide = input(false);

  /** Total de registros del servidor; obligatorio en modo servidor. */
  readonly total = input<number | null>(null);

  /** Página actual (base 0) cuando la paginación la controla el servidor. */
  readonly pageIndex = input(0);

  /** Emite la acción elegida junto con la fila completa. */
  readonly actionSelected = output<DataTableActionEvent>();

  /** Emite cada cambio de página o de tamaño para que el padre recargue. */
  readonly pageChange = output<PageEvent>();

  /** Emite la fila abierta cuando la pantalla la marca como navegable. */
  readonly rowSelected = output<DataTableRow>();

  private readonly paginator = viewChild(MatPaginator);

  /** DataSource de Material para integrar el paginador. */
  protected readonly dataSource = new MatTableDataSource<DataTableRow>([]);

  /** Columnas que Material debe pintar, incluida la de acciones si aplica. */
  protected readonly displayedColumns = computed(() => {
    const base = this.columns().map((column) => column.key);
    return this.actions().length > 0 ? [...base, '__actions'] : base;
  });

  constructor() {
    // Sincroniza las filas recibidas con el DataSource y conecta el paginador
    // en cuanto la vista lo crea. En modo servidor no se conecta: si Material
    // paginara otra vez, recortaría la página que ya devolvió la API.
    effect(() => {
      this.dataSource.data = [...this.rows()];
      this.dataSource.paginator = this.serverSide() ? null : (this.paginator() ?? null);
    });
  }

  /**
   * Obtiene el valor de una celda. Soporta rutas con punto ("owner.name")
   * para columnas anidadas de las respuestas de la API.
   */
  protected cellValue(row: DataTableRow, key: string): unknown {
    return key.split('.').reduce<unknown>((value, part) => {
      if (value !== null && typeof value === 'object') {
        return (value as Record<string, unknown>)[part];
      }
      return undefined;
    }, row);
  }

  /** Fecha local legible; devuelve el valor original si no es una fecha. */
  protected formatDate(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : this.dateFormatter.format(date);
  }

  /** Tamaños en bytes con unidad legible (B, KB, MB). */
  protected formatSize(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) {
      return '—';
    }
    if (bytes < 1024) {
      return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /** Clase CSS del badge según el valor (ADMIN, USER, activo, etc.). */
  protected badgeClass(value: unknown): string {
    const normalized = String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-');
    return `badge badge-${normalized}`;
  }

  /** Notifica al padre qué acción se eligió sobre qué fila. */
  protected emitAction(action: DataTableAction, row: DataTableRow): void {
    this.actionSelected.emit({ action: action.id, row });
  }

  /** Reenvía el cambio de página para que la pantalla consulte a la API. */
  protected onPageChange(event: PageEvent): void {
    this.pageChange.emit(event);
  }

  /** Acciones que corresponden a una fila concreta. */
  protected rowActions(row: DataTableRow): readonly DataTableAction[] {
    return this.actionsForRow()?.(row) ?? this.actions();
  }

  /** Determina si la fila responde a clic o Enter. */
  protected isRowClickable(row: DataTableRow): boolean {
    return this.rowClickable()(row);
  }

  /** Emite la fila solo si la pantalla la marcó como navegable. */
  protected selectRow(row: DataTableRow): void {
    if (this.isRowClickable(row)) {
      this.rowSelected.emit(row);
    }
  }

  private readonly dateFormatter = new Intl.DateTimeFormat('es', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}
