import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SectionPlaceholderComponent } from '../../../shared/section-placeholder/section-placeholder.component';

/** Panel ADMIN de usuarios (siguiente etapa). */
@Component({
  selector: 'app-list-users',
  imports: [SectionPlaceholderComponent],
  templateUrl: './list-users.component.html',
  styleUrl: './list-users.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ListUsersComponent {}
