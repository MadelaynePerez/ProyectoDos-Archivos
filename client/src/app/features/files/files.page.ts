import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../shared/section-placeholder/section-placeholder.component';

/** Explorador de carpetas y archivos (siguiente etapa). */
@Component({
  selector: 'app-files-page',
  imports: [SectionPlaceholderComponent],
  template: `
    <app-section-placeholder
      title="Mis archivos"
      description="Aquí podrás navegar carpetas, subir archivos .txt y .md, descargar, renombrar, mover y eliminar."
      icon="folder"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilesPage {}
