import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Panel ADMIN de usuarios (siguiente etapa). */
@Component({
  selector: 'app-users-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Usuarios"
      description="Aquí el administrador podrá activar o desactivar cuentas y cambiar el rol de los usuarios."
      icon="group"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersPage {}
