import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Recursos que otros usuarios compartieron conmigo (siguiente etapa). */
@Component({
  selector: 'app-shared-with-me-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Compartido conmigo"
      description="Aquí verás los archivos y carpetas que otros usuarios han compartido contigo."
      icon="call_received"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedWithMePage {}
