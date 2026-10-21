import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Permisos concedidos por mí (siguiente etapa). */
@Component({
  selector: 'app-shared-by-me-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Compartido por mí"
      description="Aquí administrarás los permisos READ, COMMENT y EDIT que has concedido sobre tus recursos."
      icon="call_made"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SharedByMePage {}
