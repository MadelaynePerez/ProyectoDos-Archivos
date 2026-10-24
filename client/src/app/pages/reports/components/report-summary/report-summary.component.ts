import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

/** Elemento de una barra del resumen. */
export interface ReportSummaryItem {
  label: string;
  value: number;
}

/**
 * Resumen visual simple para los reportes agregados.
 *
 * No es una librería de gráficas: dibuja barras horizontales con HTML/CSS a
 * partir de los mismos datos de la tabla, de modo que el reporte sigue siendo
 * legible de un vistazo sin agregar dependencias.
 */
@Component({
  selector: 'app-report-summary',
  imports: [MatCardModule],
  templateUrl: './report-summary.component.html',
  styleUrl: './report-summary.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportSummaryComponent {
  /** Título mostrado sobre las barras. */
  readonly title = input.required<string>();

  /** Unidad de los valores (archivos, operaciones, destinatarios, etc.). */
  readonly valueLabel = input.required<string>();

  /** Datos ya ordenados y limitados por la pantalla. */
  readonly items = input.required<readonly ReportSummaryItem[]>();

  /** Mayor valor del conjunto; se usa para escalar todas las barras. */
  readonly maxValue = computed(() => Math.max(1, ...this.items().map((item) => item.value)));

  /** Ancho relativo de la barra, en porcentaje. */
  percent(value: number): number {
    return Math.round((value / this.maxValue()) * 100);
  }
}
