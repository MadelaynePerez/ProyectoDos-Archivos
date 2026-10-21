import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Permisos concedidos por mí (siguiente etapa). */
@Component({
  selector: 'app-list-shared-by-me',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-shared-by-me.component.html',
  styleUrl: './list-shared-by-me.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSharedByMeComponent {}
