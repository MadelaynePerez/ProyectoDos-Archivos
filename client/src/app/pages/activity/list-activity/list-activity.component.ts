import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Historial de actividad del usuario (siguiente etapa). */
@Component({
  selector: 'app-list-activity',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-activity.component.html',
  styleUrl: './list-activity.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListActivityComponent {}
