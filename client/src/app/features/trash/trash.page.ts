import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Papelera: restaurar y purgar recursos (siguiente etapa). */
@Component({
  selector: 'app-trash-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Papelera"
      description="Aquí podrás restaurar archivos y carpetas o eliminarlos definitivamente."
      icon="delete"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrashPage {}
