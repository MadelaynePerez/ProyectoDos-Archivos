import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Historial de actividad del usuario (siguiente etapa). */
@Component({
  selector: 'app-activity-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Actividad"
      description="Aquí consultarás el historial de acciones realizadas sobre tus archivos y carpetas."
      icon="history"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActivityPage {}
