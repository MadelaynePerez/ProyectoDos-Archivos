import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

/**
 * Contenedor temporal para las secciones que se implementarán en las
 * siguientes etapas. Mantiene el layout y la estética sin duplicar HTML.
 */
@Component({
  selector: 'app-section-placeholder',
  imports: [MatCardModule, MatIconModule],
  templateUrl: './section-placeholder.component.html',
  styleUrl: './section-placeholder.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionPlaceholderComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('folder_open');
}
