import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Reportes con filtros de fecha y usuario (siguiente etapa). */
@Component({
  selector: 'app-reports-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Reportes"
      description="Aquí verás los reportes de archivos, comparticiones y actividad, con filtros de fecha y usuario."
      icon="bar_chart"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsPage {}
