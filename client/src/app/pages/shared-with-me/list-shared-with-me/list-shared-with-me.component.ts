import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Recursos que otros usuarios compartieron conmigo (siguiente etapa). */
@Component({
  selector: 'app-list-shared-with-me',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-shared-with-me.component.html',
  styleUrl: './list-shared-with-me.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListSharedWithMeComponent {}
