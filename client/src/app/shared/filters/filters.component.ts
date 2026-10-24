import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

/** Opción del selector de usuario; se mantiene genérica para reutilizarla. */
export interface FilterOption {
  value: string;
  label: string;
}

/** Valores normalizados que emite el componente de filtros. */
export interface FiltersValue {
  search: string;
  userId: string;
  /** Fecha inicial en ISO 8601 (00:00:00.000 del día local). */
  from: string | null;
  /** Fecha final en ISO 8601 (23:59:59.999 del día local). */
  to: string | null;
}

/**
 * Barra de filtros reutilizable (búsqueda, usuario y rango de fechas).
 *
 * Cada pantalla activa solo los campos que necesita mediante los inputs
 * `showSearch`, `showUser` y `showDateRange`, y recibe un único evento
 * `filtersChange` al aplicar o limpiar. Así se evita duplicar formularios de
 * filtro en actividad, reportes y demás listados.
 */
@Component({
  selector: 'app-filters',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './filters.component.html',
  styleUrl: './filters.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FiltersComponent {
  /** Muestra el campo de búsqueda de texto. */
  readonly showSearch = input(true);

  /** Muestra el selector de usuario (requiere `userOptions`). */
  readonly showUser = input(false);

  /** Muestra el rango de fechas "Desde"/"Hasta". */
  readonly showDateRange = input(true);

  /** Opciones del selector de usuario. */
  readonly userOptions = input<readonly FilterOption[]>([]);

  /**
   * Texto de la opción vacía del selector de usuario.
   * Los reportes lo usan para aclarar que, sin usuario, el backend consulta
   * el usuario autenticado en lugar de "todos".
   */
  readonly userEmptyLabel = input('Todos los usuarios');

  /** Texto de ayuda del campo de búsqueda. */
  readonly searchPlaceholder = input('Buscar por nombre...');

  /** Emite los filtros aplicados; los campos ocultos se envían vacíos. */
  readonly filtersChange = output<FiltersValue>();

  /** Formulario único con los tres tipos de filtro. */
  readonly form = new FormGroup({
    search: new FormControl('', { nonNullable: true }),
    userId: new FormControl('', { nonNullable: true }),
    from: new FormControl<Date | null>(null),
    to: new FormControl<Date | null>(null),
  });

  /** Valida que el rango no esté invertido antes de consultar la API. */
  apply(): void {
    const { from, to } = this.form.getRawValue();

    if (from && to && from.getTime() > to.getTime()) {
      const fromControl = this.form.controls.from;
      fromControl.setErrors({ dateRange: true });
      fromControl.markAsTouched();
      return;
    }

    this.form.controls.from.setErrors(null);

    const search = this.form.controls.search.value.trim();
    const userId = this.form.controls.userId.value;

    this.filtersChange.emit({
      search,
      userId,
      // La API interpreta el rango como inclusivo: se envía el inicio del día
      // local y el final del mismo día, convertidos a ISO 8601 (UTC).
      from: from ? this.startOfDay(from) : null,
      to: to ? this.endOfDay(to) : null,
    });
  }

  /** Restablece todos los campos y notifica al padre para que recargue. */
  clear(): void {
    this.form.reset({ search: '', userId: '', from: null, to: null });
    this.form.controls.from.setErrors(null);
    this.filtersChange.emit({ search: '', userId: '', from: null, to: null });
  }

  /** Quita el error de rango al cambiar una fecha. */
  clearRangeError(): void {
    if (this.form.controls.from.hasError('dateRange')) {
      this.form.controls.from.setErrors(null);
    }
  }

  private startOfDay(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0).toISOString();
  }

  private endOfDay(date: Date): string {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    ).toISOString();
  }
}
