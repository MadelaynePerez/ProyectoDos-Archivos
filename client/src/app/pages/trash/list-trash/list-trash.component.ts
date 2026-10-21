import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Papelera: restaurar y purgar recursos (siguiente etapa). */
@Component({
  selector: 'app-list-trash',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-trash.component.html',
  styleUrl: './list-trash.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListTrashComponent {}
