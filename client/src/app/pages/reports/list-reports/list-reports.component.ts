import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Reportes con filtros de fecha y usuario (siguiente etapa). */
@Component({
  selector: 'app-list-reports',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-reports.component.html',
  styleUrl: './list-reports.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListReportsComponent {}
