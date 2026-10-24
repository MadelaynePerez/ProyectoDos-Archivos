import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';

import { apiErrorMessage } from '../../../core/api/api-error';
import type { ReportGranularity, ReportId, ReportQuery } from '../../../core/models/report.model';
import { AuthService } from '../../../core/services/auth.service';
import { ReportsService } from '../../../core/services/reports.service';
import { UsersService } from '../../../core/services/users.service';
import {
  DataTableComponent,
  type DataTableRow,
} from '../../../shared/data-table/data-table.component';
import {
  FiltersComponent,
  type FilterOption,
  type FiltersValue,
} from '../../../shared/filters/filters.component';
import {
  ReportSummaryComponent,
  type ReportSummaryItem,
} from '../components/report-summary/report-summary.component';
import {
  REPORT_DEFINITIONS,
  REPORT_GROUPS,
  type ReportDefinition,
  type ReportGroup,
} from './report-definitions';

/** Cantidad máxima de barras del resumen para no saturar la pantalla. */
const MAX_SUMMARY_BARS = 8;

/** Filtros iniciales: sin rango ni usuario, el backend decide el alcance. */
const EMPTY_FILTERS: FiltersValue = {
  search: '',
  userId: '',
  from: null,
  to: null,
};

/**
 * Pantalla única de reportes.
 *
 * Los 14 reportes comparten esta vista: la configuración declarativa de
 * `report-definitions.ts` decide qué filtros mostrar, qué columnas pintar y
 * cómo resumir los datos. Así no hay una pantalla por reporte y la tabla
 * reutilizable se usa igual que en el resto de la aplicación.
 */
@Component({
  selector: 'app-list-reports',
  imports: [
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatProgressBarModule,
    DataTableComponent,
    FiltersComponent,
    ReportSummaryComponent,
  ],
  templateUrl: './list-reports.component.html',
  styleUrl: './list-reports.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListReportsComponent {
  private readonly reportsService = inject(ReportsService);
  private readonly usersService = inject(UsersService);
  private readonly snackBar = inject(MatSnackBar);

  /** Se expone para que la plantilla consulte el rol sin duplicar estado. */
  readonly auth = inject(AuthService);

  readonly reportGroups = REPORT_GROUPS;

  /** Reporte seleccionado; el primero se muestra al entrar. */
  readonly selectedId = signal<ReportId>(REPORT_DEFINITIONS[0].id);

  readonly selectedReport = computed(
    () =>
      REPORT_DEFINITIONS.find((report) => report.id === this.selectedId()) ?? REPORT_DEFINITIONS[0],
  );

  /** Filas devueltas por el endpoint del reporte activo. */
  readonly rows = signal<readonly DataTableRow[]>([]);
  readonly loading = signal(false);

  /** Rango de fechas y usuario elegidos en el componente de filtros. */
  readonly filters = signal<FiltersValue>(EMPTY_FILTERS);

  /** Granularidad exclusiva de `operations-by-period`. */
  readonly granularity = signal<ReportGranularity>('day');

  /** Usuarios para el selector de ADMIN (el backend exige ese rol). */
  readonly userOptions = signal<readonly FilterOption[]>([]);

  /** Columnas de la tabla según el reporte activo. */
  readonly columns = computed(() => this.selectedReport().columns);

  /** El reporte necesita fechas, usuario o ambos. */
  readonly showFilters = computed(() => {
    const filters = this.selectedReport().filters;
    return Boolean(filters.dates || (filters.userId && this.auth.isAdmin()));
  });

  readonly showDatesFilter = computed(() => this.selectedReport().filters.dates === true);

  /** El selector de usuario solo se muestra a ADMIN, como pide el contrato. */
  readonly showUserFilter = computed(
    () => this.selectedReport().filters.userId === true && this.auth.isAdmin(),
  );

  /** Datos del resumen gráfico; vacío si el reporte no define uno. */
  readonly summaryItems = computed<readonly ReportSummaryItem[]>(() => {
    const summary = this.selectedReport().summary;
    if (!summary) {
      return [];
    }

    return this.rows()
      .slice(0, MAX_SUMMARY_BARS)
      .map((row) => ({ label: summary.label(row), value: summary.value(row) }));
  });

  readonly emptyMessage = computed(() => {
    const report = this.selectedReport();
    const filters = this.filters();
    const hasActiveFilters =
      (report.filters.dates === true && Boolean(filters.from || filters.to)) ||
      (report.filters.userId === true && Boolean(filters.userId));

    return hasActiveFilters
      ? `No hay datos para "${report.name}" con los filtros seleccionados.`
      : `Todavía no hay datos para "${report.name}".`;
  });

  /** Evita que una respuesta tardía de otro reporte pise la tabla actual. */
  private loadSequence = 0;

  constructor() {
    // El listado de usuarios solo lo puede consultar un ADMIN.
    if (this.auth.isAdmin()) {
      this.loadUsers();
    }
    this.loadReport();
  }

  /** Reportes que pertenecen a un grupo del selector. */
  reportsByGroup(group: ReportGroup): readonly ReportDefinition[] {
    return REPORT_DEFINITIONS.filter((report) => report.group === group);
  }

  /** Cambia de reporte y consulta su endpoint con los filtros compatibles. */
  onReportChange(reportId: ReportId): void {
    this.selectedId.set(reportId);
    this.loadReport();
  }

  /** Aplica el rango de fechas y/o usuario del componente compartido. */
  onFiltersChange(value: FiltersValue): void {
    this.filters.set(value);
    this.loadReport();
  }

  /** Cambia la agrupación temporal del reporte por período. */
  onGranularityChange(value: ReportGranularity): void {
    this.granularity.set(value);
    if (this.selectedReport().filters.granularity) {
      this.loadReport();
    }
  }

  /** Botón "Actualizar": repite la consulta del reporte activo. */
  reload(): void {
    this.loadReport();
  }

  /**
   * Ejecuta el `load` declarado en la configuración.
   *
   * Solo se envían los filtros que el reporte declara usar: por ejemplo, el
   * userId seleccionado nunca se manda a un reporte que no lo admite.
   */
  private loadReport(): void {
    const report = this.selectedReport();
    const filters = this.filters();
    const query: ReportQuery = {
      from: report.filters.dates ? (filters.from ?? undefined) : undefined,
      to: report.filters.dates ? (filters.to ?? undefined) : undefined,
      userId: report.filters.userId ? filters.userId || undefined : undefined,
      granularity: report.filters.granularity ? this.granularity() : undefined,
    };

    const sequence = ++this.loadSequence;
    this.loading.set(true);

    report
      .load(this.reportsService, query)
      .pipe(
        finalize(() => {
          // Solo el último reporte puede apagar el indicador: una respuesta
          // anterior no debe ocultar el progreso de la consulta vigente.
          if (sequence === this.loadSequence) {
            this.loading.set(false);
          }
        }),
      )
      .subscribe({
        next: (rows) => {
          if (sequence === this.loadSequence) {
            this.rows.set(rows);
          }
        },
        error: (error: unknown) => {
          if (sequence === this.loadSequence) {
            this.rows.set([]);
            this.showError(error, `No se pudo cargar el reporte "${report.name}".`);
          }
        },
      });
  }

  /** Carga los usuarios del panel para el selector de ADMIN. */
  private loadUsers(): void {
    this.usersService.list().subscribe({
      next: (users) => {
        this.userOptions.set(
          users.map((user) => ({
            value: user._id,
            label: `${user.name} (${user.email})`,
          })),
        );
      },
      error: (error: unknown) =>
        this.showError(error, 'No se pudieron cargar los usuarios para el filtro.'),
    });
  }

  /** Mensajes claros para 400, 403 y demás errores del backend. */
  private showError(error: unknown, fallback: string): void {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      this.snackBar.open('No tienes permiso para consultar los datos de otro usuario.', 'Cerrar', {
        duration: 6000,
      });
      return;
    }

    const message = apiErrorMessage(error, fallback, {
      badRequest: 'Los filtros del reporte no son válidos. Revisa el rango de fechas y el usuario.',
    });

    this.snackBar.open(message, 'Cerrar', { duration: 6000 });
  }
}
