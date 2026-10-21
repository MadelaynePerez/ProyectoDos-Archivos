import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Explorador de carpetas y archivos (siguiente etapa). */
@Component({
  selector: 'app-list-files',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-files.component.html',
  styleUrl: './list-files.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListFilesComponent {}
